# 🛒 Hybrid RAG E-Commerce System

Sistema e-commerce containerizzato basato su architettura **Hybrid Search** (BM25 + ChromaDB) e un modulo **Self-RAG** potenziato dall'IA di Groq per l'analisi del sentiment delle recensioni.

---

## 🏗️ Architettura & Stack Tecnologico

- **Frontend**: React + Vite + Tailwind CSS (Porta `3000`)
- **Backend**: FastAPI + Uvicorn (Porta `8001`)
- **Vector Database**: ChromaDB in modalità persistente (Volume condiviso)
- **Search Engines**: 
  - *Lessicale*: `BM25Okapi` in RAM per codici e ricerche esatte.
  - *Semantico*: `ChromaDB` per corrispondenze basate sul significato.
- **LLM Engine**: Groq SDK (`llama3-70b-8192`) per la sintesi Self-RAG delle recensioni.

---

## 📁 Struttura delle Collezioni Vettoriali
Il database locale (`chroma_data`) gestisce due collezioni distinte:
1. `home_products`: Indicizzazione semantica di nome, descrizione e categoria.
2. `product_reviews`: Indicizzazione delle singole recensioni per l'estrazione del contesto e l'analisi AI.

---

📝 Appunto Tecnico: Connessione Nativa con ChromaDB PersistentClient
A differenza di un'architettura client-server tradizionale basata su chiamate HTTP di rete (soggette a problemi di timeout, gestione dei tenant e instabilità all'avvio), questo progetto utilizza ChromaDB in modalità PersistentClient locale.

```
import chromadb
chroma_client = chromadb.PersistentClient(path="/chroma/chroma")
```
⚙️ Come funziona l'integrazione:
Condivisione del File System (Volume Docker):
Il volume Docker chroma_data viene montato contemporaneamente all'interno del container Backend (nel percorso /chroma/chroma).

Inizializzazione Nativa in Python:
Nel codice FastAPI (main.py), il client viene istanziato direttamente tramite il driver C++/Python nativo:

Python
import chromadb
chroma_client = chromadb.PersistentClient(path="/chroma/chroma")
Persistenza e I/O Diretto:

Il database scrive i dati strutturati e gli indici vettoriali HNSW direttamente su file SQLite (chroma.sqlite3) e file binari all'interno del volume condiviso.

Il Backend legge e scrive su disco a livello locale, eliminando qualsiasi intermediario di rete e azzerando i conflitti legati alle versioni dei server HTTP o ai tenant (default_tenant).

## 🚀 Comandi per Azionare il Progetto con Docker

### Prerequisiti
Assicurati di avere Docker e Docker Compose installati sul tuo sistema.

### 1. Configurazione API Key (Opzionale per l'AI)
Nel file `docker-compose.yml`, inserisci la tua chiave API di Groq nel campo dell'ambiente backend:
```yaml
- GROQ_API_KEY=gsk_tua_chiave_groq_qui
```
## avvio del progetto (build pulita)
```
docker compose build --no-cache
docker compose up -d
```
## riavviare e fermare e pulire 
```
docker compose restart backend
docker compose down -v
```
