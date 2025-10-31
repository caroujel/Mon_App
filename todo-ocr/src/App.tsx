import React, { useEffect, useMemo, useRef, useState } from 'react'
import { ListChecks, RefreshCcw, Download, Upload, Search, Filter, Calendar, Tag, Edit3, Trash2, Check, Camera } from 'lucide-react'
import Tesseract from 'tesseract.js'

type Priority = 'Faible'|'Moyenne'|'Haute'
type Status = 'active'|'complétée'

type Item = {
  id: string
  titre: string
  notes: string
  liste: string
  priorite: Priority
  tags: string[]
  echeance: string|null
  statut: Status
  creeLe: number
}

const PRIORITIES: Priority[] = ['Faible','Moyenne','Haute']
const STATUSES: Status[] = ['active','complétée']

const uid = () => Math.random().toString(36).slice(2,10)
const todayISO = () => new Date().toISOString().slice(0,10)

const load = <T,>(k:string, v:T): T => {
  try { return JSON.parse(localStorage.getItem(k) || 'null') ?? v } catch { return v }
}
const save = (k:string, v:any) => localStorage.setItem(k, JSON.stringify(v))

const formatDate = (iso?: string|null) => {
  if (!iso) return '—'
  try { return new Date(iso).toLocaleDateString(undefined, { year:'numeric', month:'short', day:'numeric' }) }
  catch { return iso }
}

export default function App(){
  const [items, setItems] = useState<Item[]>(() => load('liste.items', [] as Item[]))
  const [listes, setListes] = useState<string[]>(() => load('liste.listes', ['Ma liste']))

  // form d'ajout
  const [draft, setDraft] = useState({ titre:'', notes:'', liste:'Ma liste', priorite:'Moyenne' as Priority, tags:[] as string[], echeance:'' })
  const [query, setQuery] = useState('')
  const [filtreListe, setFiltreListe] = useState('toutes')
  const [filtreStatut, setFiltreStatut] = useState('tous')
  const [filtrePriorite, setFiltrePriorite] = useState('toutes')
  const [tri, setTri] = useState({ cle:'creeLe' as keyof Item, ordre:'desc' as 'asc'|'desc' })
  const [selection, setSelection] = useState<Set<string>>(new Set())

  const titreRef = useRef<HTMLInputElement|null>(null)
  const rechercheRef = useRef<HTMLInputElement|null>(null)

  useEffect(()=> save('liste.items', items), [items])
  useEffect(()=> save('liste.listes', listes), [listes])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'n' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); titreRef.current?.focus() }
      if (e.key.toLowerCase() === 'f' && !e.metaKey && !e.ctrlKey) { e.preventDefault(); rechercheRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const listsOptions = useMemo(()=> ['toutes', ...listes], [listes])

  const filtered = useMemo(() => {
    let out = [...items]
    if (query.trim()){
      const q = query.toLowerCase()
      out = out.filter(it => it.titre.toLowerCase().includes(q) || it.notes.toLowerCase().includes(q) || it.tags.join(' ').toLowerCase().includes(q))
    }
    if (filtreListe !== 'toutes') out = out.filter(it => it.liste === filtreListe)
    if (filtreStatut !== 'tous') out = out.filter(it => it.statut === (filtreStatut as Status))
    if (filtrePriorite !== 'toutes') out = out.filter(it => it.priorite === (filtrePriorite as Priority))

    const cmp = (a:Item,b:Item) => {
      let va:any = (a as any)[tri.cle], vb:any = (b as any)[tri.cle]
      if (tri.cle === 'echeance' && (!va || !vb)) { if (!va && !vb) return 0; if (!va) return 1; if (!vb) return -1 }
      if (tri.cle === 'priorite') { const order:Record<Priority,number> = {Haute:3,Moyenne:2,Faible:1}; va = order[va]; vb = order[vb] }
      if (typeof va === 'string') va = va.toLowerCase()
      if (typeof vb === 'string') vb = vb.toLowerCase()
      if (va < vb) return tri.ordre === 'asc' ? -1 : 1
      if (va > vb) return tri.ordre === 'asc' ? 1 : -1
      return 0
    }
    out.sort(cmp)
    return out
  }, [items, query, filtreListe, filtreStatut, filtrePriorite, tri])

  const clearDraft = () => setDraft({ titre:'', notes:'', liste:listes[0] || 'Ma liste', priorite:'Moyenne', tags:[], echeance:'' })

  const addItem = () => {
    if (!draft.titre.trim()) return
    const it: Item = {
      id: uid(),
      titre: draft.titre.trim(),
      notes: draft.notes.trim(),
      liste: draft.liste,
      priorite: draft.priorite as Priority,
      tags: draft.tags,
      echeance: draft.echeance || null,
      statut: 'active',
      creeLe: Date.now()
    }
    setItems(prev => [it, ...prev])
    clearDraft()
    titreRef.current?.focus()
  }

  const toggle = (id:string) => setItems(prev => prev.map(it => it.id === id ? ({...it, statut: it.statut==='active'?'complétée':'active'}) : it))
  const remove = (ids:string[]) => setItems(prev => prev.filter(it => !ids.includes(it.id)))
  const update = (id:string, patch: Partial<Item>) => setItems(prev => prev.map(it => it.id === id ? ({...it, ...patch}) : it))

  const onBulkComplete = () => { setItems(prev => prev.map(it => selection.has(it.id) ? ({...it, statut:'complétée'}) : it)); setSelection(new Set()) }
  const onBulkDelete = () => { remove([...selection]); setSelection(new Set()) }

  const allSelectedOnPage = filtered.length>0 && filtered.every(it => selection.has(it.id))
  const overdue = (it:Item) => it.echeance && new Date(it.echeance) < new Date(todayISO()) && it.statut !== 'complétée'

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify({ items, listes }, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `liste-export-${todayISO()}.json`
    a.click(); URL.revokeObjectURL(url)
  }

  const importRef = useRef<HTMLInputElement|null>(null)
  const onImport = (file?: File|null) => {
    if (!file) return
    const reader = new FileReader()
    reader.onload = () => {
      try {
        const data = JSON.parse(String(reader.result||'{}'))
        if (Array.isArray(data.items)) setItems(data.items)
        if (Array.isArray(data.listes)) setListes(data.listes)
      } catch { alert('Fichier invalide') }
    }
    reader.readAsText(file)
  }

  // OCR dialog state
  const [scanOpen, setScanOpen] = useState(false)
  const [scanImage, setScanImage] = useState<string>('')
  const [scanLines, setScanLines] = useState<string[]>([])
  const [scanSelected, setScanSelected] = useState<Set<string>>(new Set())
  const [scanWorking, setScanWorking] = useState(false)
  const [scanLang, setScanLang] = useState<'fra'|'eng'>('fra')
  const videoRef = useRef<HTMLVideoElement|null>(null)
  const canvasRef = useRef<HTMLCanvasElement|null>(null)
  const fileRef = useRef<HTMLInputElement|null>(null)

  useEffect(()=> { if (!scanOpen) stopCamera() }, [scanOpen])

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode:'environment' } })
      if (videoRef.current){ (videoRef.current as any).srcObject = stream; await videoRef.current.play() }
    } catch(e:any){ alert('Caméra indisponible : ' + e.message) }
  }
  const stopCamera = () => {
    const v = videoRef.current as any
    const s = v?.srcObject
    const tracks = s?.getTracks?.() || []
    tracks.forEach((t:any)=> t.stop())
    if (v) v.srcObject = null
  }
  const capture = () => {
    const v = videoRef.current, c = canvasRef.current; if (!v || !c) return
    c.width = v.videoWidth; c.height = v.videoHeight
    const ctx = c.getContext('2d')!
    ctx.drawImage(v, 0, 0)
    const data = c.toDataURL('image/png')
    setScanImage(data)
  }
  const onScanFile = (f?: File|null) => {
    if (!f) return
    const r = new FileReader()
    r.onload = () => setScanImage(String(r.result))
    r.readAsDataURL(f)
  }
  const runOCR = async () => {
    if (!scanImage) return
    setScanWorking(true); setScanLines([]); setScanSelected(new Set())
    try{
      const res = await Tesseract.recognize(scanImage, scanLang, { logger: ()=>{} })
      const tx = res.data.text || ''
      const lines = tx.split(/\r?\n/).map(x=> x.trim()).map(x=> x.replace(/^[-–•*\d.\)\(\s]+/, '')).filter(Boolean)
      setScanLines(lines)
      setScanSelected(new Set(lines))
    }catch(e:any){ alert('Échec OCR : ' + e.message + '\nAstuce : bonne lumière, photo droite.') }
    finally{ setScanWorking(false) }
  }
  const importScanned = () => {
    if (scanSelected.size === 0) return
    const now = Date.now()
    const newItems: Item[] = [...scanSelected].map((t,i) => ({
      id: uid(), titre: t, notes:'', liste: draft.liste, priorite: 'Moyenne', tags: [], echeance: null, statut: 'active', creeLe: now - i
    }))
    setItems(prev => [...newItems, ...prev])
    setScanOpen(false); setScanImage(''); setScanLines([]); setScanSelected(new Set())
  }

  return (
    <div className="container">
      <div className="header">
        <div className="h1"><ListChecks/> Gestionnaire de liste</div>
        <div className="toolbar">
          <button className="primary" onClick={()=> setScanOpen(true)}><Camera size={16}/> Scanner</button>
          <button onClick={()=> setItems([])}><RefreshCcw size={16}/> Réinitialiser</button>
          <button onClick={exportJSON}><Download size={16}/> Exporter</button>
          <button onClick={()=> importRef.current?.click()}><Upload size={16}/> Importer</button>
          <input ref={importRef} type="file" accept="application/json" style={{display:'none'}} onChange={e=> onImport(e.target.files?.[0])}/>
        </div>
      </div>

      <div className="card grid" style={{gridTemplateColumns:'repeat(12,1fr)'}}>
        <div style={{gridColumn:'span 5'}}>
          <label>Titre</label>
          <input ref={titreRef} placeholder="Ex: Acheter du lait" value={draft.titre} onChange={e=> setDraft(d=> ({...d, titre:e.target.value}))}/>
        </div>
        <div style={{gridColumn:'span 3'}}>
          <label>Liste</label>
          <div className="row">
            <select value={draft.liste} onChange={e=> setDraft(d=> ({...d, liste: e.target.value}))}>
              {listes.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <button onClick={()=> {
              const name = prompt('Nom de la nouvelle liste ?')
              if (name && !listes.includes(name)){ setListes([...listes, name]); setDraft(d=> ({...d, liste:name})) }
            }}>+ Liste</button>
          </div>
        </div>
        <div style={{gridColumn:'span 2'}}>
          <label>Priorité</label>
          <select value={draft.priorite} onChange={e=> setDraft(d=> ({...d, priorite: e.target.value as Priority}))}>
            {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
        <div style={{gridColumn:'span 2'}}>
          <label>Échéance</label>
          <input type="date" value={draft.echeance} onChange={e=> setDraft(d=> ({...d, echeance: e.target.value}))}/>
        </div>
        <div style={{gridColumn:'span 12'}}>
          <label>Notes</label>
          <textarea rows={3} placeholder="Détails, liens, etc." value={draft.notes} onChange={e=> setDraft(d=> ({...d, notes:e.target.value}))}/>
        </div>
        <div style={{gridColumn:'span 12'}} className="row" >
          <label style={{margin:'0'}}>Tags</label>
          <input placeholder="ex: courses, maison" onKeyDown={e=> {
            if (e.key==='Enter'){ const v = (e.target as HTMLInputElement).value.trim(); if (v){ setDraft(d=> ({...d, tags:[...d.tags, v]})); (e.target as HTMLInputElement).value='' } }
          }}/>
          <div className="tags">{draft.tags.map(t => <span key={t} className="tag">{t}</span>)}</div>
          <button className="primary" onClick={addItem}>Ajouter</button>
        </div>
      </div>

      <div className="card row" style={{justifyContent:'space-between', flexWrap:'wrap', gap:12, marginTop:10}}>
        <div className="row" style={{gap:8, flexWrap:'wrap'}}>
          <div className="row"><Search size={16}/><input ref={rechercheRef} placeholder="Rechercher (f)" value={query} onChange={e=> setQuery(e.target.value)}/></div>
          <div className="row"><Filter size={16}/>
            <select value={filtreListe} onChange={e=> setFiltreListe(e.target.value)}>
              {listsOptions.map(l => <option key={l} value={l}>{l}</option>)}
            </select>
            <select value={filtreStatut} onChange={e=> setFiltreStatut(e.target.value)}>
              <option value="tous">Tous</option>
              {STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
            <select value={filtrePriorite} onChange={e=> setFiltrePriorite(e.target.value)}>
              <option value="toutes">Toutes</option>
              {PRIORITIES.map(p => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div className="row">
            <select value={tri.cle as string} onChange={e=> setTri(t=> ({...t, cle: e.target.value as keyof Item}))}>
              <option value="creeLe">Date de création</option>
              <option value="echeance">Échéance</option>
              <option value="priorite">Priorité</option>
              <option value="titre">Titre</option>
            </select>
            <select value={tri.ordre} onChange={e=> setTri(t=> ({...t, ordre: e.target.value as 'asc'|'desc'}))}>
              <option value="asc">Ascendant</option>
              <option value="desc">Descendant</option>
            </select>
          </div>
        </div>
        <div className="row" style={{gap:8}}>
          <button onClick={()=> { const all = new Set(selection); filtered.forEach(it=> all.add(it.id)); setSelection(all) }}>Tout sélectionner</button>
          <button onClick={()=> setSelection(new Set())} className="ghost">Tout désélectionner</button>
          <button onClick={onBulkComplete}>Marquer fait</button>
          <button onClick={onBulkDelete} style={{borderColor:'var(--warn)', color:'var(--warn)'}}><Trash2 size={16}/> Supprimer</button>
        </div>
      </div>

      <div className="grid" style={{marginTop:10}}>
        {filtered.map(it => (
          <div key={it.id} className="card item" style={{borderColor: overdue(it)? '#fecaca': 'var(--border)'}}>
            <div style={{display:'flex', gap:12}}>
              <input type="checkbox" checked={selection.has(it.id)} onChange={e=> { const s = new Set(selection); e.target.checked ? s.add(it.id) : s.delete(it.id); setSelection(s) }}/>
              <div>
                <div className="row" style={{gap:8, flexWrap:'wrap'}}>
                  <button onClick={()=> toggle(it.id)}>{it.statut==='complétée' ? 'Fait' : 'À faire'}</button>
                  <span className="badge">{it.priorite}</span>
                  {it.echeance && <span className={'badge ' + (overdue(it)?'warn':'') }><Calendar size={14}/> {formatDate(it.echeance)}</span>}
                  <span className="badge">{it.liste}</span>
                </div>
                <div style={{marginTop:6, fontWeight:600, textDecoration: it.statut==='complétée'?'line-through':'none', color: it.statut==='complétée'?'#94a3b8':'inherit'}}>{it.titre}</div>
                {it.notes && <div style={{marginTop:4}}><small>{it.notes}</small></div>}
                <div className="row" style={{gap:6, flexWrap:'wrap', marginTop:6}}>
                  {it.tags.map(t => <span key={t} className="badge"><Tag size={14}/> {t}</span>)}
                </div>
              </div>
            </div>
            <div className="row" style={{gap:8}}>
              <button onClick={()=> {
                const titre = prompt('Titre', it.titre) ?? it.titre
                const liste = prompt('Liste', it.liste) ?? it.liste
                const priorite = (prompt('Priorité (Faible/Moyenne/Haute)', it.priorite) ?? it.priorite) as Priority
                const echeance = prompt('Échéance (YYYY-MM-DD ou vide)', it.echeance || '') || null
                update(it.id, { titre, liste, priorite, echeance })
              }}><Edit3 size={16}/> Modifier</button>
              <button onClick={()=> remove([it.id])} style={{borderColor:'var(--warn)', color:'var(--warn)'}}><Trash2 size={16}/> Supprimer</button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="card" style={{textAlign:'center', color:'var(--muted)'}}>Aucune entrée ne correspond à vos filtres.</div>
        )}
      </div>

      <div style={{textAlign:'center', marginTop:16}}>
        <small>Astuces : tapez <span className="kbd">n</span> pour ajouter rapidement, <span className="kbd">f</span> pour rechercher.</small>
      </div>

      {/* Scan Dialog (native <dialog>) */}
      <dialog open={scanOpen} onClose={()=> setScanOpen(false)}>
        <div className="grid">
          <h3 style={{margin:'0 0 8px 0'}}>Scanner une liste papier</h3>
          <div className="row" style={{justifyContent:'space-between'}}>
            <div className="row" style={{gap:6}}>
              <label>Langue OCR</label>
              <select value={scanLang} onChange={e=> setScanLang(e.target.value as any)}>
                <option value="fra">Français</option>
                <option value="eng">English</option>
              </select>
            </div>
            <div className="row" style={{gap:8}}>
              <button onClick={()=> { setScanImage(''); setScanLines([]); setScanSelected(new Set()); startCamera() }}>Caméra</button>
              <button onClick={()=> { stopCamera(); fileRef.current?.click() }}>Image</button>
              <input ref={fileRef} type="file" accept="image/*" style={{display:'none'}} onChange={e=> onScanFile(e.target.files?.[0])}/>
            </div>
          </div>

          <video ref={videoRef} style={{width:'100%', borderRadius:12, display: scanImage? 'none':'block', background:'#0001'}} playsInline muted />
          <canvas ref={canvasRef} style={{display:'none'}}/>
          {scanImage && <img src={scanImage} alt="capture" style={{maxHeight:280, border:'1px solid var(--border)', borderRadius:12}} />}

          <div className="row" style={{gap:8}}>
            <button onClick={()=> capture()}>Capturer</button>
            <button className="primary" onClick={runOCR} disabled={!scanImage || scanWorking}>{scanWorking? 'Analyse en cours…':'Lancer l\'OCR'}</button>
          </div>

          {scanLines.length>0 && (
            <div>
              <label>Éléments trouvés</label>
              <div style={{maxHeight:180, overflow:'auto', border:'1px solid var(--border)', padding:8, borderRadius:12, background:'#f8fafc'}}>
                {scanLines.map(l => (
                  <label key={l} className="row" style={{gap:8}}>
                    <input type="checkbox" checked={scanSelected.has(l)} onChange={()=> { const s = new Set(scanSelected); s.has(l)? s.delete(l): s.add(l); setScanSelected(s) }}/>
                    <span>{l}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="row" style={{justifyContent:'flex-end', gap:8}}>
            <button onClick={()=> setScanOpen(false)} className="ghost">Fermer</button>
            <button className="primary" onClick={importScanned} disabled={scanSelected.size===0}>Importer {scanSelected.size>0?`(${scanSelected.size})`:''}</button>
          </div>
        </div>
      </dialog>
    </div>
  )
}