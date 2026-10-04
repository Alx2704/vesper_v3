(() => {
'use strict';

/* ============================================================
   CONFIGURACIÓN
   ============================================================ */
const CFG = Object.assign({
    TMDB_BASE: 'https://api.themoviedb.org/3',
    IMG: 'https://image.tmdb.org/t/p',
    IDIOMA: 'es-MX',
    MEDIA_BASE: '',
    PATRON_EPISODIO: '{carpeta}/S{ss}E{ee}.mp4',
    CACHE_DIAS: 30,
    CONCURRENCIA: 5,
    HERO_SEGUNDOS: 10,
    TMDB_API_KEY: ''
}, window.VESPER_CONFIG || {});

const UNIVERSOS = window.UNIVERSOS || [];
const DIA = 864e5;

/* ============================================================
   UTILIDADES
   ============================================================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));
const pad = n => String(n).padStart(2, '0');

// Crea elementos sin usar innerHTML (evita inyección de HTML con títulos raros)
function el(tag, attrs, ...hijos) {
    const n = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
        if (v == null || v === false) continue;
        if (k === 'class') n.className = v;
        else if (k === 'dataset') Object.assign(n.dataset, v);
        else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
        else n.setAttribute(k, v === true ? '' : v);
    }
    for (const h of hijos.flat(Infinity)) {
        if (h == null || h === false) continue;
        n.append(h.nodeType ? h : document.createTextNode(String(h)));
    }
    return n;
}

const norm = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ').replace(/\bversus\b/g, 'vs')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\bone\b/g, '1').replace(/\btwo\b/g, '2').replace(/\bthree\b/g, '3')
    .replace(/\biii\b/g, '3').replace(/\bii\b/g, '2').replace(/\bi\b/g, '1')
    .trim();

const slug = s => norm(s).replace(/ /g, '-');

// 1.0 = títulos iguales; si uno contiene al otro (p. ej. "Death" y "DC Showcase: Death") puntúa 0.8
function similitud(a, b) {
    const A = new Set(norm(a).split(' ').filter(Boolean));
    const B = new Set(norm(b).split(' ').filter(Boolean));
    if (!A.size || !B.size) return 0;
    let comunes = 0;
    A.forEach(t => { if (B.has(t)) comunes++; });
    const jaccard = comunes / (A.size + B.size - comunes);
    const contiene = comunes / Math.min(A.size, B.size);
    return Math.max(jaccard, contiene * 0.8);
}

const duracion = min => {
    if (!min) return '';
    const h = Math.floor(min / 60), m = min % 60;
    return h ? `${h} h ${m} min` : `${m} min`;
};

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

/* ============================================================
   ALMACENAMIENTO LOCAL (lista, vistas, progreso, caché)
   ============================================================ */
const store = {
    get(k, def) {
        try { const v = localStorage.getItem('vesper:' + k); return v ? JSON.parse(v) : def; }
        catch { return def; }
    },
    set(k, v) {
        try { localStorage.setItem('vesper:' + k, JSON.stringify(v)); } catch { /* sin espacio o modo privado */ }
    }
};

const estado = {
    lista: new Set(store.get('lista', [])),
    vistas: new Set(store.get('vistas', [])),   // películas, series y episodios (id--sXeY)
    progreso: store.get('progreso', {})          // { id: { t, d, ts, s: idSerie } }
};
const guardarEstado = () => {
    store.set('lista', [...estado.lista]);
    store.set('vistas', [...estado.vistas]);
    store.set('progreso', estado.progreso);
};

let cache = store.get('tmdb_v1', {});
let cacheTimer;
const cacheGet = k => { const e = cache[k]; return e && Date.now() - e.ts < e.ttl ? e.d : undefined; };
const cacheSet = (k, d, dias) => {
    cache[k] = { ts: Date.now(), ttl: dias * DIA, d };
    clearTimeout(cacheTimer);
    cacheTimer = setTimeout(() => store.set('tmdb_v1', cache), 400);
};

/* ============================================================
   CATÁLOGO PLANO (películas y series)
   ============================================================ */
const PELIS = [];
const porId = new Map();
UNIVERSOS.forEach(u => {
    const tipo = u.tipo || 'pelicula';
    let n = 0;
    u.grupos.forEach(g => g.peliculas.forEach(p => {
        n++;
        const f = Object.assign({}, p, {
            id: slug(`${u.id} ${p.t} ${p.y}`),
            q: p.q || p.t,
            tipo,
            universo: u,
            grupo: g.titulo,
            orden: u.numerar ? n : null,
            meta: null,
            promesa: null
        });
        PELIS.push(f);
        porId.set(f.id, f);
    }));
});
const peliculasDe = u => PELIS.filter(f => f.universo === u);
const universosDe = tipo => UNIVERSOS.filter(u => (u.tipo || 'pelicula') === tipo);
const esSerie = f => f.tipo === 'serie';

const anioTexto = f => esSerie(f) && f.fin
    ? `${f.y}–${f.fin === 'actual' ? 'actualidad' : f.fin}`
    : String(f.y);

const textoBusqueda = f => norm(`${f.t} ${f.q} ${f.universo.corto} ${f.grupo || ''} ${f.y}`);

/* ============================================================
   TMDB
   ============================================================ */
function crearCola(limite) {
    let activos = 0;
    const pendientes = [];
    const siguiente = () => {
        while (activos < limite && pendientes.length) {
            const { fn, res, rej } = pendientes.shift();
            activos++;
            fn().then(res, rej).finally(() => { activos--; siguiente(); });
        }
    };
    return (fn, prioridad = false) => new Promise((res, rej) => {
        const tarea = { fn, res, rej };
        prioridad ? pendientes.unshift(tarea) : pendientes.push(tarea);
        siguiente();
    });
}
const encolar = crearCola(CFG.CONCURRENCIA);

async function tmdb(ruta, params = {}, intento = 0) {
    const clave = CFG.TMDB_API_KEY;
    if (!clave) throw new Error('Falta TMDB_API_KEY en config.js');
    const url = new URL(CFG.TMDB_BASE + ruta);
    const headers = {};
    if (clave.length > 40) headers.Authorization = 'Bearer ' + clave;
    else url.searchParams.set('api_key', clave);
    url.searchParams.set('language', CFG.IDIOMA);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const r = await fetch(url, { headers });
    if (r.status === 429 && intento < 3) {
        await sleep((Number(r.headers.get('Retry-After')) || 1) * 1000);
        return tmdb(ruta, params, intento + 1);
    }
    if (!r.ok) throw new Error('TMDB respondió ' + r.status);
    return r.json();
}

// Elige el mejor resultado de la búsqueda comparando título y año
function elegir(resultados, f) {
    let mejor = null, mejorPuntos = 0;
    for (const r of resultados) {
        const titulo = r.title || r.name || '';
        const original = r.original_title || r.original_name || '';
        const anio = Number((r.release_date || r.first_air_date || '').slice(0, 4)) || 0;
        const sim = Math.max(similitud(f.q, titulo), similitud(f.q, original));
        if (sim < 0.5) continue;
        const dy = anio ? Math.abs(anio - f.y) : 9;
        const puntos = sim * 4 + (dy === 0 ? 2 : dy === 1 ? 1 : 0)
            + (r.poster_path ? 0.3 : 0) + Math.min(r.popularity || 0, 50) / 500;
        if (puntos > mejorPuntos) { mejor = r; mejorPuntos = puntos; }
    }
    return mejor;
}

async function resolver(f) {
    const k = 'm:' + f.id;
    const guardado = cacheGet(k);
    if (guardado) return guardado;

    let meta = { ok: false };
    try {
        let r = null;
        const serie = esSerie(f);
        if (f.tmdb) {
            r = await tmdb((serie ? '/tv/' : '/movie/') + f.tmdb);
        } else {
            for (const anio of [f.y, f.y + 1, f.y - 1, null]) {
                const params = { query: f.q, include_adult: 'false' };
                if (anio) params[serie ? 'first_air_date_year' : 'year'] = anio;
                const datos = await tmdb(serie ? '/search/tv' : '/search/movie', params);
                r = elegir(datos.results || [], f);
                if (r) break;
            }
        }
        if (r) {
            meta = {
                ok: true, id: r.id, poster: r.poster_path, backdrop: r.backdrop_path,
                sinopsis: r.overview || '', rating: r.vote_average || 0,
                fecha: r.release_date || r.first_air_date || ''
            };
        }
        cacheSet(k, meta, meta.ok ? CFG.CACHE_DIAS : 1);
    } catch (e) {
        console.warn('Vesper: no se pudo consultar TMDB para', f.t, e.message);
        meta = { ok: false, error: true, mensaje: e.message };
    }
    return meta;
}

function cargarMeta(f, prioridad = false) {
    if (!f.promesa) {
        f.promesa = encolar(() => resolver(f), prioridad).then(m => {
            f.meta = m;
            if (m.error) f.promesa = null;   // permite reintentar más tarde
            pintarPelicula(f);
            return m;
        });
    }
    return f.promesa;
}

async function detalles(f) {
    const m = await cargarMeta(f);
    if (!m.ok) return null;
    const k = 'd:' + m.id + (esSerie(f) ? ':tv' : '');
    const guardado = cacheGet(k);
    if (guardado) { f._detalle = guardado; return guardado; }
    try {
        const ruta = (esSerie(f) ? '/tv/' : '/movie/') + m.id;
        const r = await tmdb(ruta);
        let sinopsis = r.overview || '', enIngles = false;
        if (!sinopsis) {
            const en = await tmdb(ruta, { language: 'en-US' });
            sinopsis = en.overview || '';
            enIngles = !!sinopsis;
        }
        const d = {
            runtime: esSerie(f) ? ((r.episode_run_time || [])[0] || 0) : (r.runtime || 0),
            generos: (r.genres || []).map(g => g.name),
            tagline: r.tagline || '',
            sinopsis, enIngles
        };
        if (esSerie(f)) {
            d.temporadas = (r.seasons || [])
                .filter(s => s.season_number > 0 && s.episode_count > 0)
                .map(s => ({ n: s.season_number, eps: s.episode_count }));
            d.totalTemporadas = d.temporadas.length;
            d.totalEpisodios = d.temporadas.reduce((a, s) => a + s.eps, 0);
        }
        cacheSet(k, d, CFG.CACHE_DIAS);
        f._detalle = d;
        return d;
    } catch (e) {
        console.warn('Vesper: sin detalles para', f.t, e.message);
        return null;
    }
}

async function episodiosDe(f, n) {
    const m = f.meta;
    if (!m || !m.ok) return null;
    const k = `e:${m.id}:${n}`;
    const guardado = cacheGet(k);
    if (guardado) return guardado;
    try {
        const r = await tmdb(`/tv/${m.id}/season/${n}`);
        const eps = (r.episodes || []).map(e => ({
            n: e.episode_number,
            nombre: e.name || `Episodio ${e.episode_number}`,
            runtime: e.runtime || 0,
            sinopsis: e.overview || ''
        }));
        cacheSet(k, eps, CFG.CACHE_DIAS);
        return eps;
    } catch (e) {
        console.warn('Vesper: sin episodios para', f.t, 'T' + n, e.message);
        return null;
    }
}

const urlPoster = (f, w) => f.meta && f.meta.poster ? `${CFG.IMG}/${w}${f.meta.poster}` : '';
const urlFondo = (f, w) => f.meta && f.meta.backdrop ? `${CFG.IMG}/${w}${f.meta.backdrop}` : '';

const PLACEHOLDER = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><defs>' +
    '<linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#17171f"/>' +
    '<stop offset="1" stop-color="#2b1242"/></linearGradient></defs>' +
    '<rect width="200" height="300" fill="url(#g)"/>' +
    '<path d="M100 105 l-34 26 14 -3 8 16 12 -12 12 12 8 -16 14 3z" fill="none" stroke="#6A0DAD" stroke-width="3" stroke-linejoin="round"/></svg>');

/* ============================================================
   ESTADO: LISTA / VISTAS / PROGRESO / EPISODIOS
   ============================================================ */
const idEp = (f, ss, ee) => `${f.id}--s${ss}e${ee}`;
const episodiosVistos = f => {
    let n = 0;
    estado.vistas.forEach(k => { if (k.startsWith(f.id + '--')) n++; });
    return n;
};

function revisarSerieCompleta(f) {
    const d = f._detalle;
    if (d && d.totalEpisodios && episodiosVistos(f) >= d.totalEpisodios && !estado.vistas.has(f.id)) {
        estado.vistas.add(f.id);
        guardarEstado();
        refrescarEstados();
    }
}

function alternarLista(f) {
    const dentro = estado.lista.has(f.id);
    dentro ? estado.lista.delete(f.id) : estado.lista.add(f.id);
    guardarEstado();
    refrescarEstados();
    toast(dentro ? `Quitada de Mi Lista: ${f.t}` : `Añadida a Mi Lista: ${f.t}`);
    if (ruta().vista === 'lista') render();
}

function alternarVista(f) {
    const vista = estado.vistas.has(f.id);
    vista ? estado.vistas.delete(f.id) : estado.vistas.add(f.id);
    if (!vista) delete estado.progreso[f.id];
    guardarEstado();
    refrescarEstados();
    toast(vista ? `Marcada como pendiente: ${f.t}` : `Marcada como vista: ${f.t}`);
    if (ruta().vista === 'lista') render();
}

function refrescarEstados() {
    $$('.card').forEach(c => {
        const id = c.dataset.id;
        c.classList.toggle('en-lista', estado.lista.has(id));
        c.classList.toggle('visto', estado.vistas.has(id));
        const fav = $('.card-fav', c);
        if (fav) fav.setAttribute('aria-pressed', estado.lista.has(id));
        const vis = $('.card-visto', c);
        if (vis) {
            vis.setAttribute('aria-pressed', estado.vistas.has(id));
            vis.title = estado.vistas.has(id) ? 'Marcar como pendiente' : 'Marcar como vista';
        }
        const p = estado.progreso[id];
        const barra = $('.card-progreso span', c);
        if (barra) barra.style.width = p && p.d ? Math.min(100, p.t / p.d * 100) + '%' : '0%';
    });
    const n = estado.lista.size;
    const cont = $('#contador-lista');
    cont.hidden = !n;
    cont.textContent = n;
    if (heroActual) pintarBotonesHero();
    if (modalActual) pintarBotonesModal();
}

const tienePlay = f => !f.pronto && (esSerie(f) ? Boolean(f.carpeta) : Boolean(f.archivo));

/* ============================================================
   AVISOS
   ============================================================ */
let toastTimer;
function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('visible'), 3200);
}

/* ============================================================
   TARJETAS Y FILAS
   ============================================================ */
let observador = null;
function nuevoObservador() {
    if (observador) observador.disconnect();
    if (!('IntersectionObserver' in window)) { observador = null; return; }
    observador = new IntersectionObserver(entradas => {
        entradas.forEach(e => {
            if (!e.isIntersecting) return;
            observador.unobserve(e.target);
            const f = porId.get(e.target.dataset.id);
            if (f) cargarMeta(f);
        });
    }, { rootMargin: '300px 400px' });
}

function crearCard(f) {
    const card = el('article', {
        class: 'card cargando', tabindex: '0', role: 'button',
        'aria-label': `${f.t} (${anioTexto(f)}). Ver detalles`, dataset: { id: f.id }
    },
        el('img', { class: 'card-img', alt: '', src: PLACEHOLDER, loading: 'lazy', decoding: 'async', width: '200', height: '300' }),
        el('div', { class: 'card-info' },
            el('span', { class: 'card-titulo' }, f.t),
            el('span', { class: 'card-anio' }, esSerie(f) ? `Serie · ${anioTexto(f)}` : anioTexto(f))),
        f.orden ? el('span', { class: 'badge-orden', title: 'Orden recomendado' }, '#' + f.orden) : null,
        f.pronto ? el('span', { class: 'badge-pronto', title: 'Aún no se estrena' }, 'Pronto')
            : tienePlay(f) ? el('span', { class: 'badge-disp', title: 'Disponible en tu servidor' }, '▶') : null,
        el('button', {
            class: 'card-fav', type: 'button', 'aria-pressed': 'false',
            'aria-label': `Alternar Mi Lista: ${f.t}`, title: 'Mi Lista',
            onclick: e => { e.stopPropagation(); alternarLista(f); }
        }, '+'),
        el('button', {
            class: 'card-visto', type: 'button', 'aria-pressed': 'false',
            'aria-label': `Alternar visto: ${f.t}`, title: 'Marcar como vista',
            onclick: e => { e.stopPropagation(); alternarVista(f); }
        }, '✓'),
        el('div', { class: 'card-progreso' }, el('span'))
    );
    card.addEventListener('click', () => abrirDetalle(f));
    card.addEventListener('keydown', e => {
        if ((e.key === 'Enter' || e.key === ' ') && e.target === card) { e.preventDefault(); abrirDetalle(f); }
    });
    if (f.meta) pintarCard(card, f);
    if (observador) observador.observe(card); else cargarMeta(f);
    return card;
}

function pintarCard(card, f) {
    card.classList.remove('cargando');
    const img = $('.card-img', card);
    const w342 = urlPoster(f, 'w342'), w500 = urlPoster(f, 'w500');
    if (w342) {
        img.onerror = () => { img.onerror = null; img.removeAttribute('srcset'); img.src = PLACEHOLDER; };
        img.srcset = `${w342} 1x, ${w500} 2x`;
        img.src = w342;
    }
    card.classList.toggle('en-lista', estado.lista.has(f.id));
    card.classList.toggle('visto', estado.vistas.has(f.id));
}

function pintarPelicula(f) {
    $$(`.card[data-id="${f.id}"]`).forEach(c => pintarCard(c, f));
    if (heroActual === f) pintarHero(f);
    if (modalActual === f) pintarModalDatos(f);
    refrescarEstados();
}

function crearFila(titulo, subtitulo, pelis, opciones = {}) {
    const pista = el('div', { class: 'carrusel', role: 'list' }, pelis.map(f => crearCard(f)));
    const desplazar = dir => pista.scrollBy({ left: dir * pista.clientWidth * 0.85, behavior: 'smooth' });
    const prev = el('button', { class: 'flecha flecha-prev', type: 'button', 'aria-label': 'Anterior', onclick: () => desplazar(-1) }, '‹');
    const next = el('button', { class: 'flecha flecha-next', type: 'button', 'aria-label': 'Siguiente', onclick: () => desplazar(1) }, '›');
    const actualizar = () => {
        prev.hidden = pista.scrollLeft < 8;
        next.hidden = pista.scrollLeft + pista.clientWidth >= pista.scrollWidth - 8;
    };
    pista.addEventListener('scroll', actualizar, { passive: true });
    requestAnimationFrame(actualizar);
    window.addEventListener('resize', actualizar);

    return el('section', { class: 'fila' },
        el('div', { class: 'fila-cab' },
            el('h2', null, titulo),
            subtitulo ? el('p', { class: 'fila-sub' }, subtitulo) : null,
            opciones.enlace ? el('a', { class: 'fila-enlace', href: opciones.enlace }, 'Ver todo') : null),
        el('div', { class: 'fila-cuerpo' }, prev, pista, next));
}

function crearGrid(pelis) {
    return el('div', { class: 'grid' }, pelis.map(f => crearCard(f)));
}

function estadoVacio(titulo, texto, enlaceTexto, enlaceHref) {
    return el('div', { class: 'vacio' },
        el('h2', null, titulo),
        el('p', null, texto),
        enlaceTexto ? el('a', { class: 'btn-play', href: enlaceHref }, enlaceTexto) : null);
}

/* ============================================================
   VISTAS
   ============================================================ */
function vistaInicio(cont) {
    const continuar = Object.entries(estado.progreso)
        .filter(([id, p]) => p.t > 20 && !estado.vistas.has(id))
        .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))
        .map(([id, p]) => porId.get(p.s || id))
        .filter((f, i, a) => f && a.indexOf(f) === i);
    if (continuar.length) cont.append(crearFila('Continuar viendo', null, continuar));

    const lista = PELIS.filter(f => estado.lista.has(f.id));
    if (lista.length) cont.append(crearFila('Mi Lista', null, lista, { enlace: '#/lista' }));

    const disponibles = PELIS.filter(tienePlay);
    if (disponibles.length) cont.append(crearFila('Disponibles en tu servidor', null, disponibles));

    UNIVERSOS.forEach(u => {
        u.grupos.forEach(g => {
            const pelis = PELIS.filter(f => f.universo === u && f.grupo === g.titulo);
            const titulo = g.titulo ? `${u.corto}: ${g.titulo}` : u.titulo;
            const sub = !g.titulo && u.numerar ? 'Orden recomendado' : null;
            cont.append(crearFila(titulo, sub, pelis, { enlace: '#/universo/' + u.id }));
        });
    });
}

function vistaUniversos(cont) {
    cont.append(el('header', { class: 'cab-vista' }, el('h1', null, 'Universos'),
        el('p', null, 'Elige un universo para ver su contenido en orden.')));
    [['pelicula', 'Películas'], ['serie', 'Series']].forEach(([tipo, etiqueta]) => {
        const lista = universosDe(tipo);
        if (!lista.length) return;
        const grid = el('div', { class: 'universos' });
        lista.forEach(u => {
            const pelis = peliculasDe(u);
            const vistas = pelis.filter(f => estado.vistas.has(f.id)).length;
            const anios = pelis.map(f => f.y);
            grid.append(el('a', { class: 'universo-card', href: '#/universo/' + u.id },
                el('h2', null, u.titulo),
                el('p', { class: 'universo-desc' }, u.descripcion),
                el('p', { class: 'universo-datos' },
                    `${plural(pelis.length, tipo === 'serie' ? 'serie' : 'película', tipo === 'serie' ? 'series' : 'películas')}, ${Math.min(...anios)} a ${Math.max(...anios)}`),
                el('div', { class: 'barra', role: 'img', 'aria-label': `${vistas} de ${pelis.length} vistas` },
                    el('span', { style: `width:${pelis.length ? vistas / pelis.length * 100 : 0}%` })),
                el('p', { class: 'universo-vistas' }, `${vistas} de ${pelis.length} vistas`)));
        });
        cont.append(el('h2', { class: 'grupo-titulo' }, etiqueta), grid);
    });
}

function vistaUniverso(cont, id) {
    const u = UNIVERSOS.find(x => x.id === id);
    if (!u) { cont.append(estadoVacio('Universo no encontrado', 'Ese universo no existe en el catálogo.', 'Ver universos', '#/universos')); return; }
    const pelis = peliculasDe(u);
    cont.append(el('header', { class: 'cab-vista' },
        el('a', { class: 'volver', href: '#/universos' }, '‹ Universos'),
        el('h1', null, u.titulo),
        el('p', null, u.descripcion)));
    u.grupos.forEach(g => {
        const delGrupo = pelis.filter(f => f.grupo === g.titulo);
        if (g.titulo) cont.append(el('h2', { class: 'grupo-titulo' }, g.titulo));
        cont.append(crearGrid(delGrupo));
    });
}

// Catálogo filtrable: películas o series
function vistaCatalogo(cont, q, tipo) {
    const serie = tipo === 'serie';
    const base = serie ? '#/series' : '#/peliculas';
    const filtros = { u: q.get('u') || '', e: q.get('e') || '', o: q.get('o') || 'catalogo' };

    const selU = el('select', { id: 'f-universo', 'aria-label': 'Universo' },
        el('option', { value: '' }, serie ? 'Todas las colecciones' : 'Todos los universos'),
        universosDe(tipo).map(u => el('option', { value: u.id }, u.corto)));
    const selE = el('select', { id: 'f-estado', 'aria-label': 'Estado' },
        el('option', { value: '' }, 'Todas'),
        el('option', { value: 'disp' }, 'Disponibles'),
        el('option', { value: 'vistas' }, 'Vistas'),
        el('option', { value: 'pend' }, 'Pendientes'));
    const selO = el('select', { id: 'f-orden', 'aria-label': 'Ordenar por' },
        el('option', { value: 'catalogo' }, 'Orden del catálogo'),
        el('option', { value: 'anio' }, 'Año (antiguas primero)'),
        el('option', { value: 'anio-desc' }, 'Año (nuevas primero)'),
        el('option', { value: 'titulo' }, 'Título A-Z'),
        el('option', { value: 'rating' }, 'Mejor valoradas'));
    selU.value = filtros.u; selE.value = filtros.e; selO.value = filtros.o;

    const cuenta = el('p', { class: 'cuenta', 'aria-live': 'polite' });
    const zona = el('div');

    cont.append(el('header', { class: 'cab-vista' }, el('h1', null, serie ? 'Series' : 'Películas')),
        el('div', { class: 'filtros' }, selU, selE, selO, cuenta), zona);

    const idx = f => PELIS.indexOf(f);
    const pintar = () => {
        const texto = norm($('#buscar').value);
        let res = PELIS.filter(f => {
            if (f.tipo !== tipo) return false;
            if (filtros.u && f.universo.id !== filtros.u) return false;
            if (filtros.e === 'disp' && !tienePlay(f)) return false;
            if (filtros.e === 'vistas' && !estado.vistas.has(f.id)) return false;
            if (filtros.e === 'pend' && estado.vistas.has(f.id)) return false;
            if (texto && !textoBusqueda(f).includes(texto)) return false;
            return true;
        });
        const cmp = {
            'catalogo': (a, b) => idx(a) - idx(b),
            'anio': (a, b) => a.y - b.y || idx(a) - idx(b),
            'anio-desc': (a, b) => b.y - a.y || idx(b) - idx(a),
            'titulo': (a, b) => a.t.localeCompare(b.t, 'es'),
            'rating': (a, b) => ((b.meta && b.meta.rating) || 0) - ((a.meta && a.meta.rating) || 0)
        }[filtros.o];
        res = res.sort(cmp);
        const total = plural(res.length, serie ? 'serie' : 'película', serie ? 'series' : 'películas');
        cuenta.textContent = total;
        const scrollY = window.scrollY;
        nuevoObservador();
        zona.replaceChildren(res.length ? crearGrid(res)
            : estadoVacio('Sin resultados', 'Prueba con otro título o quita algún filtro.'));
        window.scrollTo(0, scrollY);

        // La valoración solo se conoce cuando llegan los datos de TMDB. Se esperan SOLO las que
        // faltan y se reordena una única vez al terminar (antes se reprogramaba sin fin y parpadeaba).
        const ronda = ++rondaRating;
        const pendientes = filtros.o === 'rating' ? res.filter(f => !f.meta) : [];
        if (pendientes.length) {
            cuenta.textContent = `${total} · cargando valoraciones…`;
            Promise.all(pendientes.map(f => cargarMeta(f))).then(() => {
                const sigueAqui = ronda === rondaRating && filtros.o === 'rating'
                    && ruta().vista === (serie ? 'series' : 'peliculas');
                if (sigueAqui) pintar();
            });
        }
    };
    let rondaRating = 0;

    const sincronizar = () => {
        filtros.u = selU.value; filtros.e = selE.value; filtros.o = selO.value;
        const p = new URLSearchParams();
        if (filtros.u) p.set('u', filtros.u);
        if (filtros.e) p.set('e', filtros.e);
        if (filtros.o !== 'catalogo') p.set('o', filtros.o);
        history.replaceState(null, '', base + (p.toString() ? '?' + p : ''));
        pintar();
    };
    [selU, selE, selO].forEach(s => s.addEventListener('change', sincronizar));
    repintarBusqueda = pintar;
    pintar();
}

// Búsqueda global (películas y series juntas)
function vistaBuscar(cont) {
    cont.append(el('header', { class: 'cab-vista' }, el('h1', null, 'Resultados')));
    const zona = el('div');
    cont.append(zona);
    const pintar = () => {
        const texto = norm($('#buscar').value);
        nuevoObservador();
        if (!texto) {
            zona.replaceChildren(estadoVacio('Busca en el catálogo', 'Escribe un título, un universo o un año.'));
            return;
        }
        const coincide = f => textoBusqueda(f).includes(texto);
        const pelis = PELIS.filter(f => !esSerie(f) && coincide(f));
        const series = PELIS.filter(f => esSerie(f) && coincide(f));
        if (!pelis.length && !series.length) {
            zona.replaceChildren(estadoVacio('Sin resultados', 'Prueba con otro título o con el nombre de un universo.'));
            return;
        }
        zona.replaceChildren(
            pelis.length ? el('h2', { class: 'grupo-titulo' }, `Películas (${pelis.length})`) : null,
            pelis.length ? crearGrid(pelis) : null,
            series.length ? el('h2', { class: 'grupo-titulo' }, `Series (${series.length})`) : null,
            series.length ? crearGrid(series) : null);
    };
    repintarBusqueda = pintar;
    pintar();
}

function vistaLista(cont) {
    cont.append(el('header', { class: 'cab-vista' }, el('h1', null, 'Mi Lista')));
    const lista = PELIS.filter(f => estado.lista.has(f.id));
    if (lista.length) cont.append(crearGrid(lista));
    else cont.append(estadoVacio('Tu lista está vacía',
        'Pulsa + en cualquier película o serie para guardarla aquí.', 'Explorar películas', '#/peliculas'));

    const vistas = PELIS.filter(f => estado.vistas.has(f.id));
    if (vistas.length) {
        cont.append(el('h2', { class: 'grupo-titulo' }, 'Ya vistas'), crearGrid(vistas));
    }
}

/* ============================================================
   ROUTER
   ============================================================ */
let repintarBusqueda = null;

function ruta() {
    const h = location.hash.replace(/^#\/?/, '');
    const [path, qs = ''] = h.split('?');
    const partes = path.split('/').filter(Boolean);
    return { vista: partes[0] || 'inicio', arg: partes[1], q: new URLSearchParams(qs) };
}

function render() {
    const r = ruta();
    const cont = $('#vista');
    repintarBusqueda = null;
    nuevoObservador();
    cont.replaceChildren();
    window.scrollTo(0, 0);

    const esInicio = r.vista === 'inicio';
    $('#hero').hidden = !esInicio;
    cont.classList.toggle('con-hero', esInicio);
    $$('[data-nav]').forEach(a => a.classList.toggle('activo',
        a.dataset.nav === r.vista || (r.vista === 'universo' && a.dataset.nav === 'universos')));

    if (esInicio) { vistaInicio(cont); iniciarHero(); }
    else {
        detenerHero();
        if (r.vista === 'universos') vistaUniversos(cont);
        else if (r.vista === 'universo') vistaUniverso(cont, r.arg);
        else if (r.vista === 'peliculas') vistaCatalogo(cont, r.q, 'pelicula');
        else if (r.vista === 'series') vistaCatalogo(cont, r.q, 'serie');
        else if (r.vista === 'buscar') vistaBuscar(cont);
        else if (r.vista === 'lista') vistaLista(cont);
        else cont.append(estadoVacio('Página no encontrada', 'Esa dirección no existe en Vesper.', 'Ir al inicio', '#/'));
    }
    refrescarEstados();
    document.title = 'Vesper - Media Server';
}

/* ============================================================
   BANNER PRINCIPAL
   ============================================================ */
let heroActual = null, heroLista = [], heroIdx = 0, heroTimer = null, heroPausado = false;

function iniciarHero() {
    heroLista = PELIS.filter(f => f.destacada);
    if (!heroLista.length) heroLista = PELIS.slice(0, 5);
    const dots = $('#hero-dots');
    dots.replaceChildren(...heroLista.map((f, i) => el('button', {
        class: 'dot', type: 'button', role: 'tab', 'aria-label': f.t,
        onclick: () => { mostrarHero(i); reiniciarHero(); }
    })));
    heroLista.forEach((f, i) => cargarMeta(f, i === 0));
    mostrarHero(heroIdx < heroLista.length ? heroIdx : 0);
    reiniciarHero();
}

function detenerHero() {
    clearInterval(heroTimer);
    heroTimer = null;
    heroActual = null;
}

function reiniciarHero() {
    clearInterval(heroTimer);
    if (!CFG.HERO_SEGUNDOS || heroLista.length < 2) return;
    heroTimer = setInterval(() => {
        if (document.hidden || heroPausado || document.querySelector('dialog[open]')) return;
        mostrarHero((heroIdx + 1) % heroLista.length);
    }, CFG.HERO_SEGUNDOS * 1000);
}

function mostrarHero(i) {
    heroIdx = i;
    const f = heroLista[i];
    if (!f) return;
    heroActual = f;
    $$('.dot', $('#hero-dots')).forEach((d, n) => {
        d.classList.toggle('activo', n === i);
        d.setAttribute('aria-selected', n === i);
    });
    pintarHero(f);
    cargarMeta(f, true);
}

let heroFondoActual = '';
function pintarHero(f) {
    if (heroActual !== f) return;
    $('#hero-title').textContent = f.t;
    $('#hero-meta').textContent = [esSerie(f) ? 'Serie' : null, anioTexto(f), f.universo.corto, f.grupo]
        .filter(Boolean).join('  |  ');
    const sinopsis = f.meta && f.meta.ok ? (f.meta.sinopsis || 'Sin sinopsis disponible en español.')
        : f.meta && f.meta.error ? 'No se pudo conectar con TMDB. Revisa tu clave en config.js.'
        : 'Conectando con la base de datos de Vesper.';
    $('#hero-desc').textContent = sinopsis;
    const fondo = urlFondo(f, 'w1280');
    const bg = $('#hero-bg');
    if (fondo && fondo !== heroFondoActual) {
        const img = new Image();
        img.onload = () => {
            if (heroActual !== f) return;
            heroFondoActual = fondo;
            bg.style.backgroundImage = `url("${fondo}")`;
            bg.classList.add('visible');
        };
        img.src = fondo;
    } else if (!fondo) {
        bg.classList.remove('visible');
        heroFondoActual = '';
    }
    pintarBotonesHero();
}

function pintarBotonesHero() {
    const f = heroActual;
    if (!f) return;
    const b = $('#hero-lista');
    const dentro = estado.lista.has(f.id);
    b.textContent = dentro ? '✓ En Mi Lista' : '+ Mi Lista';
    b.setAttribute('aria-pressed', dentro);
    $('#hero-play').classList.toggle('sin-archivo', !tienePlay(f));
}

/* ============================================================
   DETALLE
   ============================================================ */
let modalActual = null;

function abrirDetalle(f) {
    modalActual = f;
    const dlg = $('#detalle');
    $('#det-titulo').textContent = f.t;
    $('#det-sinopsis').textContent = 'Cargando…';
    $('#det-tagline').hidden = true;
    $('#det-generos').replaceChildren();
    pintarModalDatos(f);
    pintarBotonesModal();
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-abierto');
    detalles(f).then(d => { if (modalActual === f) pintarModalDatos(f, d); });
}

function pintarModalDatos(f, d) {
    if (modalActual !== f) return;
    d = d || f._detalle;
    const fondo = urlFondo(f, 'w780');
    const cab = $('#det-cabecera');
    cab.style.backgroundImage = fondo ? `url("${fondo}")` : '';

    const partes = [esSerie(f) ? 'Serie' : null, anioTexto(f)];
    if (esSerie(f)) {
        if (d && d.totalTemporadas) partes.push(plural(d.totalTemporadas, 'temporada', 'temporadas'), plural(d.totalEpisodios, 'episodio', 'episodios'));
    } else if (d && d.runtime) {
        partes.push(duracion(d.runtime));
    }
    if (f.meta && f.meta.rating) partes.push(`★ ${f.meta.rating.toFixed(1)}`);
    partes.push(f.universo.corto, f.grupo);
    if (f.pronto) partes.push('Próximamente');
    $('#det-meta').textContent = partes.filter(Boolean).join('  |  ');

    const sin = d ? d.sinopsis : (f.meta && f.meta.sinopsis);
    if (f.meta && f.meta.error) $('#det-sinopsis').textContent = 'No se pudo conectar con TMDB. Revisa tu clave de API en config.js.';
    else if (d || (f.meta && f.meta.ok === false && !f.meta.error)) {
        $('#det-sinopsis').textContent = sin
            ? (d && d.enIngles ? sin + ' (Sinopsis en inglés: aún no hay traducción.)' : sin)
            : 'No hay sinopsis disponible para esto.';
    }
    const tag = $('#det-tagline');
    tag.hidden = !(d && d.tagline);
    if (d) tag.textContent = d.tagline;
    $('#det-generos').replaceChildren(...((d && d.generos) || []).map(g => el('li', null, g)));

    // Siguiente título del mismo universo
    const lista = peliculasDe(f.universo);
    const sig = lista[lista.indexOf(f) + 1];
    const btn = $('#det-siguiente');
    btn.hidden = !sig;
    if (sig) {
        btn.textContent = `Siguiente: ${sig.t}`;
        btn.onclick = () => { cargarMeta(sig); abrirDetalle(sig); $('#detalle').scrollTop = 0; };
    }

    pintarEpisodios(f, d);
}

function pintarBotonesModal() {
    const f = modalActual;
    if (!f) return;
    const lista = $('#det-lista'), visto = $('#det-visto');
    const dentro = estado.lista.has(f.id), vista = estado.vistas.has(f.id);
    lista.textContent = dentro ? '✓ En Mi Lista' : '+ Mi Lista';
    lista.setAttribute('aria-pressed', dentro);
    visto.textContent = vista ? 'Marcar como pendiente' : (esSerie(f) ? 'Marcar serie como vista' : 'Marcar como vista');
    visto.setAttribute('aria-pressed', vista);
    const enCurso = esSerie(f)
        ? Object.values(estado.progreso).some(p => p.s === f.id && p.t > 20) || episodiosVistos(f) > 0
        : (estado.progreso[f.id] && estado.progreso[f.id].t > 20 && !vista);
    $('#det-play').textContent = enCurso ? '▶ Continuar' : (f.pronto ? 'Próximamente' : '▶ Reproducir');
    $('#det-play').classList.toggle('sin-archivo', !tienePlay(f));
}

function cerrarDetalle() {
    const dlg = $('#detalle');
    if (dlg.open) dlg.close();
}

/* ============================================================
   EPISODIOS (solo series)
   ============================================================ */
let listaToken = 0;

function temporadaInicial(f, d) {
    const prog = Object.entries(estado.progreso)
        .filter(([, p]) => p.s === f.id)
        .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))[0];
    if (prog) { const m = /--s(\d+)e\d+$/.exec(prog[0]); if (m) return Number(m[1]); }
    for (const t of d.temporadas) {
        for (let e = 1; e <= t.eps; e++) if (!estado.vistas.has(idEp(f, t.n, e))) return t.n;
    }
    return d.temporadas[0].n;
}

function pintarEpisodios(f, d) {
    const sec = $('#det-episodios');
    if (!esSerie(f) || !d || !d.temporadas || !d.temporadas.length) { sec.hidden = true; return; }
    sec.hidden = false;
    const sel = $('#det-temporada');
    if (sel.dataset.serie !== f.id) {
        sel.dataset.serie = f.id;
        sel.replaceChildren(...d.temporadas.map(t => el('option', { value: String(t.n) }, `Temporada ${t.n} (${t.eps} ep.)`)));
        sel.value = String(temporadaInicial(f, d));
        listarEpisodios(f, d, Number(sel.value));
    } else if (!$('#det-ep-lista').children.length) {
        listarEpisodios(f, d, Number(sel.value));
    } else {
        actualizarResumenEp(f, d);
    }
}

async function listarEpisodios(f, d, n) {
    const token = ++listaToken;
    const ol = $('#det-ep-lista');
    ol.replaceChildren(el('li', { class: 'ep-cargando' }, 'Cargando episodios…'));
    actualizarResumenEp(f, d);
    const t = d.temporadas.find(x => x.n === n);
    let eps = await episodiosDe(f, n);
    if (token !== listaToken || modalActual !== f) return;
    if (!eps || !eps.length) {
        eps = Array.from({ length: t ? t.eps : 0 }, (_, i) => ({ n: i + 1, nombre: `Episodio ${i + 1}`, runtime: 0, sinopsis: '' }));
    }
    ol.replaceChildren(...eps.map(e => filaEpisodio(f, d, n, e)));
}

function actualizarResumenEp(f, d) {
    $('#det-ep-resumen').textContent = `${episodiosVistos(f)} de ${d.totalEpisodios} episodios vistos`;
}

function filaEpisodio(f, d, ss, e) {
    const id = idEp(f, ss, e.n);
    const li = el('li', { class: 'ep' + (estado.vistas.has(id) ? ' visto-ep' : ''), dataset: { id } });
    const vis = el('button', {
        class: 'ep-visto', type: 'button', title: 'Marcar como visto',
        'aria-pressed': String(estado.vistas.has(id)), 'aria-label': `Marcar episodio ${e.n} como visto`,
        onclick: () => alternarEpisodioVisto(f, d, id, li, vis)
    }, '✓');
    const play = el('button', {
        class: 'ep-play', type: 'button', 'aria-label': `Reproducir episodio ${e.n}: ${e.nombre}`,
        onclick: () => reproducir(itemEpisodio(f, ss, e.n, e.nombre))
    }, '▶');
    li.append(
        el('span', { class: 'ep-num' }, String(e.n)),
        el('div', { class: 'ep-info' },
            el('div', { class: 'ep-titulo' }, el('strong', null, e.nombre), e.runtime ? el('span', { class: 'ep-dur' }, duracion(e.runtime)) : null),
            e.sinopsis ? el('p', { class: 'ep-sin' }, e.sinopsis) : null),
        el('div', { class: 'ep-acc' }, play, vis));
    return li;
}

function alternarEpisodioVisto(f, d, id, li, boton) {
    const vista = estado.vistas.has(id);
    if (vista) {
        estado.vistas.delete(id);
        if (d.totalEpisodios && episodiosVistos(f) < d.totalEpisodios) estado.vistas.delete(f.id);
    } else {
        estado.vistas.add(id);
        delete estado.progreso[id];
    }
    guardarEstado();
    li.classList.toggle('visto-ep', !vista);
    boton.setAttribute('aria-pressed', String(!vista));
    actualizarResumenEp(f, d);
    revisarSerieCompleta(f);
    refrescarEstados();
}

/* ============================================================
   REPRODUCTOR
   ============================================================ */
let reproduciendo = null, ultimoGuardado = 0;

const itemPelicula = f => ({ id: f.id, t: f.t, archivo: f.archivo || '', serieId: null });

function itemEpisodio(f, ss, ee, nombre) {
    const archivo = f.carpeta
        ? CFG.PATRON_EPISODIO
            .replaceAll('{carpeta}', f.carpeta)
            .replaceAll('{ss}', pad(ss)).replaceAll('{ee}', pad(ee))
            .replaceAll('{s}', ss).replaceAll('{e}', ee)
        : '';
    const it = {
        id: idEp(f, ss, ee),
        t: `${f.t} ${ss}x${pad(ee)}${nombre ? ': ' + nombre : ''}`,
        archivo, serieId: f.id
    };
    it.siguiente = () => {
        const d = f._detalle;
        if (!d || !d.temporadas) return null;
        const t = d.temporadas.find(x => x.n === ss);
        if (t && ee < t.eps) return itemEpisodio(f, ss, ee + 1);
        const prox = d.temporadas.filter(x => x.n > ss).sort((a, b) => a.n - b.n)[0];
        return prox ? itemEpisodio(f, prox.n, 1) : null;
    };
    return it;
}

const rutaMedia = a => /^https?:\/\//i.test(a)
    ? a
    : encodeURI((CFG.MEDIA_BASE || '') + a).replace(/#/g, '%23').replace(/\?/g, '%3F');

// Botón "Reproducir" de una película o serie (en una serie sigue por donde ibas)
async function reproducirDe(f) {
    if (f.pronto) { toast(`${f.t} todavía no se estrena.`); return; }
    if (!esSerie(f)) { reproducir(itemPelicula(f)); return; }
    if (!f.carpeta) { toast('Esta serie aún no tiene carpeta. Añade el campo "carpeta" en data.js.'); return; }
    const d = f._detalle || await detalles(f);
    if (!d || !d.temporadas || !d.temporadas.length) { toast('No se pudo cargar la lista de episodios.'); return; }

    let ss = null, ee = null;
    const prog = Object.entries(estado.progreso)
        .filter(([, p]) => p.s === f.id)
        .sort((a, b) => (b[1].ts || 0) - (a[1].ts || 0))[0];
    const m = prog && /--s(\d+)e(\d+)$/.exec(prog[0]);
    if (m) { ss = Number(m[1]); ee = Number(m[2]); }
    else {
        outer: for (const t of d.temporadas) {
            for (let e = 1; e <= t.eps; e++) {
                if (!estado.vistas.has(idEp(f, t.n, e))) { ss = t.n; ee = e; break outer; }
            }
        }
    }
    if (ss == null) { ss = d.temporadas[0].n; ee = 1; }
    reproducir(itemEpisodio(f, ss, ee));
}

function reproducir(item) {
    if (!item.archivo) {
        toast('Aún no hay archivo para esto. Revisa "archivo" o "carpeta" en data.js.');
        return;
    }
    cerrarDetalle();
    if (reproduciendo) guardarProgreso(true);
    reproduciendo = item;
    const dlg = $('#reproductor');
    const video = $('#rep-video');
    $('#rep-titulo').textContent = item.t;
    video.src = rutaMedia(item.archivo);
    const p = estado.progreso[item.id];
    video.onloadedmetadata = () => {
        if (p && p.t > 20 && p.t < video.duration - 30) video.currentTime = p.t;
    };
    video.onerror = () => toast('No se pudo cargar el archivo. Revisa la ruta en data.js y MEDIA_BASE en config.js.');
    if (!dlg.open) dlg.showModal();
    document.body.classList.add('modal-abierto');
    video.play().catch(() => { /* el navegador puede exigir pulsar play */ });
}

function guardarProgreso(forzar) {
    const it = reproduciendo, v = $('#rep-video');
    if (!it || !v.duration || isNaN(v.duration)) return;
    if (!forzar && Date.now() - ultimoGuardado < 5000) return;
    ultimoGuardado = Date.now();
    if (v.currentTime / v.duration > 0.92) {
        estado.vistas.add(it.id);
        delete estado.progreso[it.id];
        if (it.serieId) { const s = porId.get(it.serieId); if (s) revisarSerieCompleta(s); }
    } else if (v.currentTime > 20) {
        estado.progreso[it.id] = {
            t: Math.floor(v.currentTime), d: Math.floor(v.duration), ts: Date.now(),
            ...(it.serieId ? { s: it.serieId } : {})
        };
    }
    guardarEstado();
}

/* ============================================================
   ARRANQUE Y EVENTOS
   ============================================================ */
function iniciarEventos() {
    // Barra superior con fondo al hacer scroll
    const barra = $('#navbar');
    const alScroll = () => barra.classList.toggle('solida', window.scrollY > 30);
    window.addEventListener('scroll', alScroll, { passive: true });
    alScroll();

    window.addEventListener('hashchange', render);

    // Buscador
    const buscar = $('#buscar');
    let t;
    buscar.addEventListener('input', () => {
        clearTimeout(t);
        t = setTimeout(() => {
            if (repintarBusqueda) repintarBusqueda();
            else if (buscar.value.trim()) location.hash = '#/buscar';
        }, 200);
    });
    buscar.addEventListener('keydown', e => {
        if (e.key === 'Escape') { buscar.value = ''; buscar.blur(); if (repintarBusqueda) repintarBusqueda(); }
    });
    document.addEventListener('keydown', e => {
        if (e.key === '/' && !/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName) && !document.querySelector('dialog[open]')) {
            e.preventDefault(); buscar.focus();
        }
    });

    // Banner
    const hero = $('#hero');
    hero.addEventListener('mouseenter', () => { heroPausado = true; });
    hero.addEventListener('mouseleave', () => { heroPausado = false; });
    $('#hero-play').addEventListener('click', () => heroActual && reproducirDe(heroActual));
    $('#hero-lista').addEventListener('click', () => heroActual && alternarLista(heroActual));
    $('#hero-info').addEventListener('click', () => heroActual && abrirDetalle(heroActual));

    // Detalle
    const det = $('#detalle');
    $('#det-cerrar').addEventListener('click', cerrarDetalle);
    det.addEventListener('click', e => { if (e.target === det) cerrarDetalle(); });
    det.addEventListener('close', () => {
        modalActual = null;
        if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-abierto');
    });
    $('#det-play').addEventListener('click', () => modalActual && reproducirDe(modalActual));
    $('#det-lista').addEventListener('click', () => modalActual && alternarLista(modalActual));
    $('#det-visto').addEventListener('click', () => modalActual && alternarVista(modalActual));
    $('#det-temporada').addEventListener('change', e => {
        const f = modalActual;
        if (f && f._detalle) listarEpisodios(f, f._detalle, Number(e.target.value));
    });

    // Reproductor
    const rep = $('#reproductor'), video = $('#rep-video');
    $('#rep-cerrar').addEventListener('click', () => rep.close());
    rep.addEventListener('close', () => {
        guardarProgreso(true);
        video.pause();
        video.removeAttribute('src');
        video.load();
        reproduciendo = null;
        if (!document.querySelector('dialog[open]')) document.body.classList.remove('modal-abierto');
        refrescarEstados();
    });
    video.addEventListener('timeupdate', () => guardarProgreso(false));
    video.addEventListener('ended', () => {
        const actual = reproduciendo;
        guardarProgreso(true);
        const sig = actual && actual.siguiente && actual.siguiente();
        if (sig && sig.archivo) { toast(`Siguiente: ${sig.t}`); reproducir(sig); }
        else { rep.close(); toast('Terminado'); }
    });
    window.addEventListener('pagehide', () => guardarProgreso(true));
}

function arrancar() {
    if (!CFG.TMDB_API_KEY) toast('Falta la clave de TMDB en config.js: se mostrarán sin portadas.');
    iniciarEventos();
    render();
}

document.addEventListener('DOMContentLoaded', arrancar);
})();
