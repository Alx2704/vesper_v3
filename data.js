/*
  CATÁLOGO DE VESPER
  ------------------
  Cada entrada (película o serie) tiene:
    t  -> título que se muestra en el sitio
    q  -> título en inglés para buscar en TMDB (si no lo pones, se usa "t")
    y  -> año de estreno (ayuda a elegir la correcta)
    fin       -> (series) año de cierre, o 'actual' si sigue en emisión
    archivo   -> (películas) archivo de video dentro de MEDIA_BASE, p. ej. 'dcau/mask-of-the-phantasm.mp4'
    carpeta   -> (series) carpeta de la serie dentro de MEDIA_BASE; los episodios se buscan con
                 PATRON_EPISODIO de config.js (por defecto: carpeta/S01E01.mp4)
    tmdb      -> (opcional) ID de TMDB si la búsqueda automática se equivoca
    destacada -> (opcional) true para que salga en el banner principal
    pronto    -> (opcional) true si aún no se estrena

  Cada universo tiene tipo: 'pelicula' (por defecto) o 'serie'.
  Con numerar: true se muestra el número de orden recomendado (#1, #2...).
  El orden en que escribas las entradas es el "Orden del catálogo".
*/
window.UNIVERSOS = [
    /* ===================== PELÍCULAS ===================== */
    {
        id: 'dcau',
        titulo: 'Universo Animado de DC (DCAU)',
        corto: 'DCAU',
        descripcion: 'Liderado originalmente por Bruce Timm, abarca las series animadas de los 90s y principios de los 2000s.',
        numerar: false,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'Batman: La máscara del Fantasma', q: 'Batman: Mask of the Phantasm', y: 1993, destacada: true },
                { t: 'Batman y Mr. Freeze: SubZero', q: 'Batman & Mr. Freeze: SubZero', y: 1998 },
                { t: 'Batman Beyond: Return of the Joker', y: 2000 },
                { t: 'Batman: Mystery of the Batwoman', y: 2003 },
                { t: 'Batman and Harley Quinn', y: 2017 },
                { t: 'Justice League vs. The Fatal Five', y: 2019 }
            ]
        }]
    },
    {
        id: 'dcamu',
        titulo: 'DC Animated Movie Universe (DCAMU)',
        corto: 'DCAMU',
        descripcion: 'Basado fuertemente en la continuidad de los cómics de los Nuevos 52, este universo cuenta una sola historia interconectada de principio a fin. Se ve en orden.',
        numerar: true,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'Justice League: The Flashpoint Paradox', y: 2013, destacada: true },
                { t: 'Justice League: War', y: 2014 },
                { t: 'Son of Batman', y: 2014 },
                { t: 'Justice League: Throne of Atlantis', y: 2015 },
                { t: 'Batman vs. Robin', y: 2015 },
                { t: 'Batman: Bad Blood', y: 2016 },
                { t: 'Justice League vs. Teen Titans', y: 2016 },
                { t: 'Justice League Dark', y: 2017 },
                { t: 'Teen Titans: The Judas Contract', y: 2017 },
                { t: 'Suicide Squad: Hell to Pay', y: 2018 },
                { t: 'The Death of Superman', y: 2018 },
                { t: 'Constantine: City of Demons', y: 2018 },
                { t: 'Reign of the Supermen', y: 2019 },
                { t: 'Batman: Hush', y: 2019 },
                { t: 'Wonder Woman: Bloodlines', y: 2019 },
                { t: 'Justice League Dark: Apokolips War', y: 2020, destacada: true },
                { t: 'DC Showcase: Constantine - The House of Mystery', q: 'Constantine: The House of Mystery', y: 2022 }
            ]
        }]
    },
    {
        id: 'tomorrowverse',
        titulo: 'Tomorrowverse',
        corto: 'Tomorrowverse',
        descripcion: 'Tras el final del DCAMU, este nuevo universo comparte un estilo de animación distinto y adapta arcos clásicos. Se ve en orden.',
        numerar: true,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'Superman: Man of Tomorrow', y: 2020 },
                { t: 'Justice Society: World War II', y: 2021 },
                { t: 'Batman: The Long Halloween, Part One', y: 2021, destacada: true },
                { t: 'Batman: The Long Halloween, Part Two', y: 2021 },
                { t: 'Green Lantern: Beware My Power', y: 2022 },
                { t: 'Legion of Super-Heroes', y: 2023 },
                { t: 'Justice League: Warworld', y: 2023 },
                { t: 'Justice League: Crisis on Infinite Earths, Part One', y: 2024 },
                { t: 'Justice League: Crisis on Infinite Earths, Part Two', y: 2024 },
                { t: 'Justice League: Crisis on Infinite Earths, Part Three', y: 2024 }
            ]
        }]
    },
    {
        id: 'elseworlds',
        titulo: 'Elseworlds',
        corto: 'Elseworlds',
        descripcion: 'Estas películas ocurren en sus propias líneas temporales y no requieren ver otras cintas previas, salvo sus secuelas directas.',
        numerar: false,
        grupos: [
            {
                titulo: 'Universo Frank Miller',
                peliculas: [
                    { t: 'Batman: Year One', y: 2011 },
                    { t: 'Batman: The Dark Knight Returns, Part 1', y: 2012 },
                    { t: 'Batman: The Dark Knight Returns, Part 2', y: 2013 }
                ]
            },
            {
                titulo: 'Batman & Superman',
                peliculas: [
                    { t: 'Superman/Batman: Enemigos Públicos', q: 'Superman/Batman: Public Enemies', y: 2009 },
                    { t: 'Superman/Batman: Apocalypse', y: 2010 }
                ]
            },
            {
                titulo: 'Sindicato del Crimen / Legión',
                peliculas: [
                    { t: 'Justice League: Crisis on Two Earths', y: 2010 },
                    { t: 'Justice League: Doom', y: 2012 }
                ]
            },
            {
                titulo: 'Red Hood',
                peliculas: [
                    { t: 'Batman: Under the Red Hood', y: 2010, destacada: true },
                    { t: 'Batman: Death in the Family', y: 2020 }
                ]
            },
            {
                titulo: 'Batman Ninja',
                peliculas: [
                    { t: 'Batman Ninja', y: 2018 },
                    { t: 'Batman Ninja vs. Yakuza League', y: 2025 }
                ]
            },
            {
                titulo: 'Watchmen',
                peliculas: [
                    { t: 'Watchmen: Chapter 1', q: 'Watchmen: Chapter I', y: 2024 },
                    { t: 'Watchmen: Chapter 2', q: 'Watchmen: Chapter II', y: 2024 }
                ]
            },
            {
                titulo: 'RWBY',
                peliculas: [
                    { t: 'Justice League x RWBY Part 1', q: 'Justice League x RWBY: Super Heroes & Huntsmen, Part One', y: 2023 },
                    { t: 'Justice League x RWBY Part 2', q: 'Justice League x RWBY: Super Heroes & Huntsmen, Part Two', y: 2023 }
                ]
            },
            {
                titulo: 'Knightfall (trilogía)',
                peliculas: [
                    { t: 'Batman: Knightfall Part 1: Knightfall', q: 'Batman: Knightfall Part One', y: 2026, destacada: true },
                    { t: 'Batman: Knightfall Part 2: Knightquest', q: 'Batman: Knightfall Part Two: Knightquest', y: 2026, pronto: true },
                    { t: 'Batman: Knightfall Part 3: KnightsEnd', q: 'Batman: Knightfall Part Three: KnightsEnd', y: 2027, pronto: true }
                ]
            },
            {
                titulo: 'Derivadas de otros medios',
                peliculas: [
                    { t: 'The Batman vs. Dracula', y: 2005 },
                    { t: 'Teen Titans: Trouble in Tokyo', y: 2006 },
                    { t: 'Batman: Gotham Knight', y: 2008 },
                    { t: 'Batman: Assault on Arkham', y: 2014 },
                    { t: 'Injustice: Gods Among Us', q: 'Injustice', y: 2021 }
                ]
            },
            {
                titulo: 'Historias autoconclusivas',
                peliculas: [
                    { t: 'Superman: Brainiac Attacks', y: 2006 },
                    { t: 'Superman: Doomsday', y: 2007 },
                    { t: 'Justice League: The New Frontier', y: 2008 },
                    { t: 'Wonder Woman', y: 2009 },
                    { t: 'Green Lantern: First Flight', y: 2009 },
                    { t: 'All-Star Superman', y: 2011 },
                    { t: 'Green Lantern: Emerald Knights', y: 2011 },
                    { t: 'Superman vs. The Elite', y: 2012 },
                    { t: 'Superman: Unbound', y: 2013 },
                    { t: 'JLA Adventures: Trapped in Time', y: 2014 },
                    { t: 'Justice League: Gods and Monsters', y: 2015 },
                    { t: 'Batman: The Killing Joke', y: 2016, destacada: true },
                    { t: 'Batman: Gotham by Gaslight', y: 2018 },
                    { t: 'Superman: Red Son', y: 2020 },
                    { t: 'Deathstroke: Knights & Dragons', y: 2020 },
                    { t: 'Batman: Soul of the Dragon', y: 2021 },
                    { t: 'Catwoman: Hunted', y: 2022 },
                    { t: 'Batman and Superman: Battle of the Super Sons', y: 2022 },
                    { t: 'Batman: The Doom That Came to Gotham', y: 2023 },
                    { t: 'Merry Little Batman', y: 2023 },
                    { t: 'Batman Azteca: Choque de Imperios', y: 2025 }
                ]
            }
        ]
    },
    {
        id: 'showcase',
        titulo: 'DC Showcase (cortometrajes)',
        corto: 'DC Showcase',
        descripcion: 'Cortos animados que acompañaban a las películas de DC en Blu-ray. Algunos conectan con el DCAMU y el Tomorrowverse.',
        numerar: false,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'DC Showcase: The Spectre', q: 'DC Showcase: The Spectre', y: 2010 },
                { t: 'DC Showcase: Jonah Hex', q: 'DC Showcase: Jonah Hex', y: 2010 },
                { t: 'DC Showcase: Green Arrow', q: 'DC Showcase: Green Arrow', y: 2010 },
                { t: 'Superman/Shazam!: The Return of Black Adam', y: 2010 },
                { t: 'DC Showcase: Catwoman', q: 'DC Showcase: Catwoman', y: 2011 },
                { t: 'DC Showcase: Sgt. Rock', q: 'DC Showcase: Sgt. Rock', y: 2019 },
                { t: 'DC Showcase: Death', q: 'DC Showcase: Death', y: 2019 },
                { t: 'DC Showcase: The Phantom Stranger', q: 'DC Showcase: The Phantom Stranger', y: 2020 },
                { t: 'DC Showcase: Adam Strange', q: 'DC Showcase: Adam Strange', y: 2020 },
                { t: 'DC Showcase: Kamandi: The Last Boy on Earth!', q: 'DC Showcase: Kamandi', y: 2021 },
                { t: 'DC Showcase: The Losers', q: 'DC Showcase: The Losers', y: 2021 },
                { t: 'DC Showcase: Blue Beetle', q: 'DC Showcase: Blue Beetle', y: 2021 }
            ]
        }]
    },
    {
        id: 'otras',
        titulo: 'Otras películas animadas de DC',
        corto: 'Otras',
        descripcion: 'Películas animadas de DC fuera de la línea principal de Warner: Batman clásico de los 60, Teen Titans Go!, Lego y más.',
        numerar: false,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'Lego Batman: The Movie - DC Super Heroes Unite', y: 2013 },
                { t: 'Batman: Return of the Caped Crusaders', y: 2016 },
                { t: 'Batman vs. Two-Face', y: 2017 },
                { t: 'The Lego Batman Movie', y: 2017 },
                { t: 'Teen Titans Go! To the Movies', y: 2018 },
                { t: 'Scooby-Doo! & Batman: The Brave and the Bold', y: 2018 },
                { t: 'Teen Titans Go! vs. Teen Titans', y: 2019 },
                { t: 'DC League of Super-Pets', y: 2022 }
            ]
        }]
    },

    /* ======================= SERIES ======================= */
    {
        id: 'series-dcau',
        tipo: 'serie',
        titulo: 'Series del DCAU',
        corto: 'Series DCAU',
        descripcion: 'Las series del universo de Bruce Timm. Las películas del DCAU están en su propio universo.',
        numerar: true,
        grupos: [{
            titulo: null,
            peliculas: [
                { t: 'Batman: La serie animada', q: 'Batman: The Animated Series', y: 1992, fin: 1995, destacada: true },
                { t: 'Superman: La serie animada', q: 'Superman: The Animated Series', y: 1996, fin: 2000 },
                { t: 'The New Batman Adventures', y: 1997, fin: 1999 },
                { t: 'Batman Beyond', y: 1999, fin: 2001 },
                { t: 'Static Shock', y: 2000, fin: 2004 },
                { t: 'Gotham Girls', y: 2000, fin: 2002 },
                { t: 'Justice League', y: 2001, fin: 2004 },
                { t: 'The Zeta Project', y: 2001, fin: 2002 },
                { t: 'Justice League Unlimited', y: 2004, fin: 2006 }
            ]
        }]
    },
    {
        id: 'series-dc',
        tipo: 'serie',
        titulo: 'Otras series animadas de DC',
        corto: 'Series DC',
        descripcion: 'Series de DC fuera del DCAU, agrupadas por personaje y ordenadas por estreno.',
        numerar: false,
        grupos: [
            {
                titulo: 'Batman',
                peliculas: [
                    { t: 'The Batman', y: 2004, fin: 2008 },
                    { t: 'Batman: The Brave and the Bold', y: 2008, fin: 2011 },
                    { t: 'Beware the Batman', y: 2013, fin: 2014 },
                    { t: 'Batman: Caped Crusader', y: 2024 },
                    { t: 'Bat-Fam', y: 2025 }
                ]
            },
            {
                titulo: 'Teen Titans',
                peliculas: [
                    { t: 'Teen Titans', y: 2003, fin: 2006 },
                    { t: 'Teen Titans Go!', y: 2013, fin: 'actual' }
                ]
            },
            {
                titulo: 'Liga de la Justicia y equipos',
                peliculas: [
                    { t: 'Legion of Super Heroes', y: 2006, fin: 2008 },
                    { t: 'Young Justice', y: 2010 },
                    { t: 'Justice League Action', y: 2016, fin: 2018 }
                ]
            },
            {
                titulo: 'Harley Quinn y Escuadrón Suicida',
                peliculas: [
                    { t: 'Harley Quinn', y: 2019 },
                    { t: 'Kite Man: Hell Yeah!', y: 2024 },
                    { t: 'Suicide Squad Isekai', y: 2024 }
                ]
            },
            {
                titulo: 'Otros héroes',
                peliculas: [
                    { t: 'Green Lantern: The Animated Series', y: 2011, fin: 2013 },
                    { t: 'DC Super Hero Girls', y: 2019, fin: 2021 },
                    { t: 'My Adventures with Superman', y: 2023 },
                    { t: 'Creature Commandos', y: 2024 }
                ]
            }
        ]
    }
];
