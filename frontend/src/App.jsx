import React, { useState, useEffect } from 'react';
import { Search, Sparkles, Plus, Edit3, Trash2, Layers, RefreshCw, MessageSquareText, ListFilter, Star } from 'lucide-react';

export default function App() {
  const [products, setProducts] = useState([]);
  const [query, setQuery] = useState('');
  const [systemUsed, setSystemUsed] = useState('Inizializzazione...');
  const [loading, setLoading] = useState(false);
  
  // Modale Recensioni
  const [activeReviewModal, setActiveReviewModal] = useState(null); // { product, type: 'summary' | 'raw', content: '' }
  const [reviewLoading, setReviewLoading] = useState(false);

  const handleSearch = async (searchQuery) => {
    setQuery(searchQuery);
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:8001/api/search?q=${encodeURIComponent(searchQuery)}`);
      const data = await res.json();
      setProducts(data.results);
      setSystemUsed(data.system_used);
    } catch (err) {
      console.error("Errore di ricerca:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    handleSearch('');
  }, []);

  // Chiama il Self-RAG per il riassunto recensioni con Groq LLM
  const handleFetchReviewSummary = async (product) => {
    setActiveReviewModal({ product, type: 'summary', content: null });
    setReviewLoading(true);
    try {
      const res = await fetch(`http://localhost:8001/api/products/${product.id}/reviews/summary`);
      const data = await res.json();
      setActiveReviewModal({ product, type: 'summary', content: data.summary });
    } catch (err) {
      console.error("Errore Self-RAG:", err);
    } finally {
      setReviewLoading(false);
    }
  };

  // Chiama direttamente il DB Vettoriale ChromaDB per le recensioni grezze
  const handleFetchRawReviews = async (product) => {
    setActiveReviewModal({ product, type: 'raw', content: null });
    setReviewLoading(true);
    try {
      const res = await fetch(`http://localhost:8001/api/products/${product.id}/reviews/raw`);
      const data = await res.json();
      setActiveReviewModal({ product, type: 'raw', content: data.reviews });
    } catch (err) {
      console.error("Errore ChromaDB Raw:", err);
    } finally {
      setReviewLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-100 font-sans p-4 md:p-6">
      <div className="max-w-[1800px] mx-auto">
        
        {/* Header */}
        <div className="flex items-center justify-between gap-4 mb-4">
          <h1 className="text-xl font-bold text-slate-800 flex items-center gap-2">
            <Layers className="text-indigo-600 w-6 h-6" /> HomeSmart RAG (ChromaDB + Self-RAG)
          </h1>
        </div>

        {/* Input Barra di Ricerca Superiore */}
        <div className="relative mb-3">
          <input
            type="text"
            placeholder="Cerca per codice/EAN (attiva BM25) o per descrizione semantica (attiva ChromaDB)..."
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            className="w-full pl-12 pr-4 py-3 bg-white border border-slate-200 rounded-xl shadow-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm"
          />
          <Search className="absolute left-4 top-3.5 w-5 h-5 text-slate-400" />
        </div>

        {/* Badge Avviso Motore Attivo */}
        <div className="mb-6 flex items-center gap-2 text-xs font-semibold px-3 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-lg w-fit">
          <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
          <span>Sistema di ricerca attivo: <strong>{systemUsed}</strong></span>
        </div>

        {/* Griglia a 6 colonne */}
        {loading ? (
          <div className="flex justify-center py-20">
            <RefreshCw className="w-8 h-8 animate-spin text-indigo-600" />
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 2xl:grid-cols-6 gap-4">
            {products.map((product) => (
              <div key={product.id} className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition flex flex-col justify-between">
                <div>
                  <img src={product.image_url} alt={product.name} className="w-full h-36 object-cover" />
                  <div className="p-3">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wide">{product.category}</span>
                      <div className="flex items-center gap-0.5 text-amber-500 text-[10px] font-bold">
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
                        <span>{product.rating}</span>
                      </div>
                    </div>
                    <h3 className="font-bold text-slate-800 text-xs line-clamp-1 mt-0.5" title={product.name}>{product.name}</h3>
                    <p className="text-[11px] text-slate-500 line-clamp-2 mt-1 leading-snug">{product.description}</p>
                  </div>
                </div>

                <div className="p-3 pt-0">
                  <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between mb-2">
                    <span className="text-sm font-extrabold text-slate-900">€{Number(product.price).toFixed(2)}</span>
                    <span className="text-[9px] text-slate-400 font-mono">EAN: {product.barcode.slice(-6)}</span>
                  </div>

                  {/* Pulsanti Recensioni: Self-RAG e ChromaDB Raw */}
                  <div className="grid grid-cols-2 gap-1.5 pt-1">
                    <button
                      onClick={() => handleFetchReviewSummary(product)}
                      className="py-1.5 px-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[10px] font-semibold rounded-lg transition flex items-center justify-center gap-1"
                      title="Sintesi AI del sentiment recensioni"
                    >
                      <Sparkles className="w-3 h-3 text-indigo-600" />
                      Sintesi AI
                    </button>
                    <button
                      onClick={() => handleFetchRawReviews(product)}
                      className="py-1.5 px-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-[10px] font-semibold rounded-lg transition flex items-center justify-center gap-1"
                      title="Tutte le recensioni da ChromaDB"
                    >
                      <ListFilter className="w-3 h-3 text-slate-500" />
                      ChromaDB
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Modal Recensioni */}
        {activeReviewModal && (
          <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
            <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl relative">
              <button
                onClick={() => setActiveReviewModal(null)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 text-xs font-bold"
              >
                ✕
              </button>

              <div className="flex items-center gap-2 mb-3">
                {activeReviewModal.type === 'summary' ? (
                  <Sparkles className="w-5 h-5 text-indigo-600" />
                ) : (
                  <MessageSquareText className="w-5 h-5 text-slate-600" />
                )}
                <h3 className="text-sm font-bold text-slate-800">
                  {activeReviewModal.type === 'summary' ? 'Sintesi Recensioni (Self-RAG Groq)' : 'Recensioni Grezze (ChromaDB)'}
                </h3>
              </div>

              <div className="mb-4 pb-2 border-b border-slate-100">
                <h4 className="font-semibold text-xs text-slate-700">{activeReviewModal.product.name}</h4>
              </div>

              {reviewLoading ? (
                <div className="py-8 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-600" />
                  <p className="text-xs text-slate-500">Recupero dati dal database vettoriale...</p>
                </div>
              ) : activeReviewModal.type === 'summary' ? (
                <div className="bg-indigo-50/70 p-3.5 rounded-xl border border-indigo-100 text-xs text-slate-700 leading-relaxed">
                  {activeReviewModal.content}
                </div>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {Array.isArray(activeReviewModal.content) && activeReviewModal.content.length > 0 ? (
                    activeReviewModal.content.map((rev, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 rounded-lg text-xs text-slate-700 border border-slate-200">
                        "{rev}"
                      </div>
                    ))
                  ) : (
                    <p className="text-xs text-slate-500">Nessuna recensione trovata in ChromaDB.</p>
                  )}
                </div>
              )}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}