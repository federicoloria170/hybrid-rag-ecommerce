import os
import re
import json
from typing import Optional, List
from fastapi import FastAPI, Query, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import chromadb
from rank_bm25 import BM25Okapi
from groq import Groq

app = FastAPI(title="HomeSmart RAG Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

GROQ_API_KEY = os.getenv("GROQ_API_KEY", "")
groq_client = None
if GROQ_API_KEY and "gsk_" in GROQ_API_KEY:
    try:
        groq_client = Groq(api_key=GROQ_API_KEY)
    except Exception:
        groq_client = None

class Product(BaseModel):
    id: str
    barcode: str
    name: str
    category: str
    description: str
    price: float
    discount_percent: Optional[float] = 0.0
    stock: int
    image_url: str
    rating: Optional[float] = 4.5
    reviews: Optional[List[str]] = []

DATASET_PATH = "/app/dataset_50_prodotti.json"

# Inizializzazione diretta di ChromaDB in modalità persistente sul volume condiviso
CHROMA_PATH = "/chroma/chroma"
print("▶ Inizializzazione ChromaDB Persistent Client...")
chroma_client = chromadb.PersistentClient(path=CHROMA_PATH)

products_collection = chroma_client.get_or_create_collection(name="home_products")
reviews_collection = chroma_client.get_or_create_collection(name="product_reviews")

PRODUCTS: List[dict] = []
bm25_index = None

def save_products_to_json():
    with open(DATASET_PATH, "w", encoding="utf-8") as f:
        json.dump(PRODUCTS, f, ensure_ascii=False, indent=2)

def rebuild_bm25():
    global bm25_index
    if PRODUCTS:
        corpus = [f"{p['name']} {p['description']} {p.get('barcode', '')} {p.get('category', '')}" for p in PRODUCTS]
        tokenized_corpus = [doc.lower().split() for doc in corpus]
        bm25_index = BM25Okapi(tokenized_corpus)
    else:
        bm25_index = None

def initialize_data():
    global PRODUCTS
    if os.path.exists(DATASET_PATH):
        with open(DATASET_PATH, "r", encoding="utf-8") as f:
            PRODUCTS = json.load(f)
            
        if products_collection.count() == 0 and PRODUCTS:
            ids = [str(p["id"]) for p in PRODUCTS]
            documents = [f"{p['name']} - {p['description']} - Categoria: {p['category']}" for p in PRODUCTS]
            metadatas = [
                {
                    "name": str(p["name"]),
                    "category": str(p["category"]),
                    "price": float(p["price"]),
                    "barcode": str(p.get("barcode", ""))
                } for p in PRODUCTS
            ]
            products_collection.add(ids=ids, documents=documents, metadatas=metadatas)
            print("▶ 50 Prodotti caricati in ChromaDB!")

        if reviews_collection.count() == 0 and PRODUCTS:
            rev_ids, rev_docs, rev_metas = [], [], []
            for p in PRODUCTS:
                reviews = p.get("reviews", [])
                for idx, rev in enumerate(reviews):
                    rev_ids.append(f"{p['id']}_rev_{idx}")
                    rev_docs.append(str(rev))
                    rev_metas.append({"product_id": str(p["id"]), "product_name": str(p["name"])})
            if rev_ids:
                reviews_collection.add(ids=rev_ids, documents=rev_docs, metadatas=rev_metas)
                print("▶ Recensioni caricate in ChromaDB!")

    rebuild_bm25()

initialize_data()

@app.get("/api/search")
def smart_search(q: Optional[str] = Query("")):
    if not q or q.strip() == "":
        return {"system_used": "Catalogo Completo", "results": PRODUCTS}

    is_code_or_number = bool(re.search(r'\d', q)) or (len(q.split()) == 1 and len(q) <= 6)

    if is_code_or_number and bm25_index:
        tokenized_query = q.lower().split()
        scores = bm25_index.get_scores(tokenized_query)
        top_indices = scores.argsort()[::-1]
        results = [PRODUCTS[i] for i in top_indices if scores[i] > 0]
        return {"system_used": "Indice Invertito (BM25 - Lessicale)", "results": results if results else PRODUCTS}
    else:
        chroma_res = products_collection.query(query_texts=[q], n_results=12)
        retrieved_ids = chroma_res["ids"][0] if chroma_res["ids"] else []
        results = [p for p in PRODUCTS if str(p["id"]) in retrieved_ids]
        return {"system_used": "Database Vettoriale (ChromaDB - Semantico)", "results": results if results else PRODUCTS}

@app.get("/api/products/{product_id}/reviews/raw")
def get_raw_reviews_from_chroma(product_id: str):
    res = reviews_collection.get(where={"product_id": product_id})
    documents = res.get("documents", [])
    return {"product_id": product_id, "total_reviews": len(documents), "reviews": documents}
@app.get("/api/products/{product_id}/reviews/summary")
def get_self_rag_review_summary(product_id: str):
    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")

    res = reviews_collection.get(where={"product_id": product_id})
    reviews = res.get("documents", [])

    if not reviews:
        return {"product_id": product_id, "summary": "Nessuna recensione disponibile per questo prodotto."}

    if not groq_client:
        return {"product_id": product_id, "summary": f"⚠️ GROQ_API_KEY non configurata. Media voti: {product.get('rating', 4.5)}/5."}

    reviews_text = "\n".join([f"- {r}" for r in reviews])
    prompt = f"Prodotto: {product['name']}\nRecensioni dei clienti:\n{reviews_text}\n\nFornisci un riassunto sintetico (max 3 frasi) del sentiment generale dei clienti."

    try:
        response = groq_client.chat.completions.create(
            model="openai/gpt-oss-120b",  # <--- Modello Groq attivo e supportato
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=250,
        )
        return {"product_id": product_id, "summary": response.choices[0].message.content}
    except Exception as e:
        return {"product_id": product_id, "summary": f"Errore Groq: {str(e)}"}
def get_self_rag_review_summary(product_id: str):
    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")

    res = reviews_collection.get(where={"product_id": product_id})
    reviews = res.get("documents", [])

    if not reviews:
        return {"product_id": product_id, "summary": "Nessuna recensione disponibile."}

    if not groq_client:
        return {"product_id": product_id, "summary": f"⚠️ GROQ_API_KEY non configurata. Media voti: {product.get('rating', 4.5)}/5."}

    reviews_text = "\n".join([f"- {r}" for r in reviews])
    prompt = f"Prodotto: {product['name']}\nRecensioni:\n{reviews_text}\nFornisci un riassunto sintetico (max 3 frasi) del sentiment dei clienti."

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",  # <--- Modello Llama 3.3 aggiornato
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=250,
        )
        return {"product_id": product_id, "summary": response.choices[0].message.content}
    except Exception as e:
        return {"product_id": product_id, "summary": f"Errore Groq: {str(e)}"}
    product = next((p for p in PRODUCTS if p["id"] == product_id), None)
    if not product:
        raise HTTPException(status_code=404, detail="Prodotto non trovato")

    res = reviews_collection.get(where={"product_id": product_id})
    reviews = res.get("documents", [])

    if not reviews:
        return {"product_id": product_id, "summary": "Nessuna recensione disponibile."}

    if not groq_client:
        return {"product_id": product_id, "summary": f"⚠️ GROQ_API_KEY non configurata. Media voti: {product.get('rating', 4.5)}/5."}

    reviews_text = "\n".join([f"- {r}" for r in reviews])
    prompt = f"Prodotto: {product['name']}\nRecensioni:\n{reviews_text}\nFornisci un riassunto sintetico (max 3 frasi) del sentiment."

    try:
        response = groq_client.chat.completions.create(
            model="llama-3.3-70b-versatile",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
            max_tokens=250,
        )
        return {"product_id": product_id, "summary": response.choices[0].message.content}
    except Exception as e:
        return {"product_id": product_id, "summary": f"Errore Groq: {str(e)}"}