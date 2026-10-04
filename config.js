// Configuración de Vesper. Edita solo este archivo para ajustar el sitio.
window.VESPER_CONFIG = {
    // Clave de TMDB (v3) o token "Read Access" (v4, el largo que empieza con eyJ).
    // OJO: en un sitio estático la clave es visible para quien abra el código.
    // Está bien en una red local; si expones el server a internet, regenérala
    // en themoviedb.org > Ajustes > API y usa un proxy.
    TMDB_API_KEY: '491c666cd4fc7ef415bc32a9ea387af2',

    // Idioma de sinopsis y datos (es-MX, es-ES, en-US...)
    IDIOMA: 'es-MX',

    // Carpeta (o URL) donde están tus archivos de video. Se antepone al campo
    // "archivo" de cada película en data.js. Ejemplo: 'peliculas/' o 'http://192.168.1.50:8096/media/'
    MEDIA_BASE: 'peliculas/',

    // Cómo se nombran los episodios de una serie dentro de su "carpeta" (campo de data.js).
    // {ss} = temporada con 2 dígitos, {ee} = episodio con 2 dígitos, {s} y {e} sin ceros.
    // Con el valor por defecto, el episodio 3 de la temporada 1 de la carpeta "batman-tas" es: batman-tas/S01E03.mp4
    PATRON_EPISODIO: '{carpeta}/S{ss}E{ee}.mp4',

    // Días que se guardan en el navegador los datos de TMDB (menos peticiones, carga más rápida)
    CACHE_DIAS: 30,

    // Cuántas consultas simultáneas a TMDB
    CONCURRENCIA: 5,

    // Segundos entre cambios automáticos del banner (0 = sin rotación)
    HERO_SEGUNDOS: 10
};
