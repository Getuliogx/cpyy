const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

const CANAIS_PERMITIDOS = process.env.CANAIS_PERMITIDOS || "";
const USUARIOS_BLOQUEADOS = process.env.USUARIOS_BLOQUEADOS || "";
const WATCH_REGION = process.env.WATCH_REGION || "BR";

// Opcional no Render:
// EMOTE_COPYRIGHT=Kappa
const EMOTE_COPYRIGHT = process.env.EMOTE_COPYRIGHT || "";

app.get("/", (req, res) => {
  res.send("API TMDB possível copyright online.");
});

function limparTexto(texto) {
  return String(texto || "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarNick(texto) {
  return String(texto || "")
    .toLowerCase()
    .replace(/^@/, "")
    .trim();
}

function normalizarTexto(texto) {
  return String(texto || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function listaEnv(texto) {
  return String(texto || "")
    .split(",")
    .map(item => normalizarNick(item))
    .filter(Boolean);
}

function canalEstaPermitido(canalRecebido) {
  const canal = normalizarNick(canalRecebido);
  const permitidos = listaEnv(CANAIS_PERMITIDOS);

  if (permitidos.length === 0) {
    return {
      ok: false,
      erro: "Erro: CANAIS_PERMITIDOS não configurado no Render."
    };
  }

  if (!canal) {
    return {
      ok: false,
      erro: "Erro: canal não informado."
    };
  }

  if (!permitidos.includes(canal)) {
    return {
      ok: false,
      erro: "Este comando não está liberado para este canal."
    };
  }

  return {
    ok: true,
    erro: ""
  };
}

function usuarioEstaBloqueado(usuarioRecebido) {
  const usuario = normalizarNick(usuarioRecebido);
  const bloqueados = listaEnv(USUARIOS_BLOQUEADOS);

  if (!usuario) {
    return {
      bloqueado: false,
      erro: ""
    };
  }

  if (bloqueados.includes(usuario)) {
    return {
      bloqueado: true,
      erro: "Você está bloqueado de usar este comando."
    };
  }

  return {
    bloqueado: false,
    erro: ""
  };
}

async function tmdbGet(url) {
  const resp = await fetch(url);

  if (!resp.ok) {
    throw new Error(`Erro TMDB HTTP ${resp.status}`);
  }

  return resp.json();
}

function nomesUnicos(lista) {
  const nomes = [];

  for (const item of lista || []) {
    const nome = typeof item === "string" ? item : item && item.name;

    if (nome && !nomes.includes(nome)) {
      nomes.push(nome);
    }
  }

  return nomes;
}

function escolherMelhorResultado(filme, serie, tipoForcado) {
  if (tipoForcado === "filme" || tipoForcado === "movie") {
    return {
      tipo: "filme",
      item: filme
    };
  }

  if (
    tipoForcado === "serie" ||
    tipoForcado === "série" ||
    tipoForcado === "tv" ||
    tipoForcado === "anime" ||
    tipoForcado === "desenho"
  ) {
    return {
      tipo: "serie",
      item: serie
    };
  }

  if (filme && !serie) {
    return {
      tipo: "filme",
      item: filme
    };
  }

  if (!filme && serie) {
    return {
      tipo: "serie",
      item: serie
    };
  }

  if (!filme && !serie) {
    return {
      tipo: "",
      item: null
    };
  }

  const popularidadeFilme = Number(filme.popularity || 0);
  const popularidadeSerie = Number(serie.popularity || 0);

  if (popularidadeFilme >= popularidadeSerie) {
    return {
      tipo: "filme",
      item: filme
    };
  }

  return {
    tipo: "serie",
    item: serie
  };
}

function extrairProviders(watchProviders) {
  const results = watchProviders && watchProviders.results ? watchProviders.results : {};
  const dadosPais = results[WATCH_REGION];

  if (!dadosPais) {
    return [];
  }

  const todos = [
    ...(dadosPais.flatrate || []),
    ...(dadosPais.buy || []),
    ...(dadosPais.rent || []),
    ...(dadosPais.ads || []),
    ...(dadosPais.free || [])
  ];

  const nomes = [];

  for (const provider of todos) {
    if (provider && provider.provider_name && !nomes.includes(provider.provider_name)) {
      nomes.push(provider.provider_name);
    }
  }

  return nomes;
}

function montarPossiveisCopyright(empresas, providers) {
  const nomes = nomesUnicos([
    ...nomesUnicos(empresas),
    ...nomesUnicos(providers)
  ]);

  if (nomes.length === 0) {
    return "";
  }

  return nomes.slice(0, 8).join(", ");
}

function detectarAnimeOuDesenho(detalhes, tipo) {
  const texto = normalizarTexto([
    detalhes.name,
    detalhes.title,
    detalhes.original_name,
    detalhes.original_title,
    ...(detalhes.genres || []).map(g => g.name),
    ...(detalhes.origin_country || [])
  ].join(" "));

  if (texto.includes("animation") || texto.includes("animacao") || texto.includes("animação")) {
    return true;
  }

  const nomes = normalizarTexto([
    detalhes.name,
    detalhes.title,
    detalhes.original_name,
    detalhes.original_title
  ].join(" "));

  const termosAnime = [
    "dragon ball",
    "naruto",
    "one piece",
    "bleach",
    "jujutsu",
    "demon slayer",
    "kimetsu",
    "attack on titan",
    "shingeki",
    "death note",
    "saint seiya",
    "cavaleiros do zodiaco",
    "pokemon",
    "digimon",
    "yu gi oh",
    "boku no hero",
    "my hero academia"
  ];

  return termosAnime.some(t => nomes.includes(t));
}

function calcularRiscoCopyright({ tipo, ano, popularidade, copyrightTexto, providers, detalhes }) {
  const texto = normalizarTexto([
    copyrightTexto,
    ...(providers || []),
    detalhes && detalhes.name,
    detalhes && detalhes.title,
    detalhes && detalhes.original_name,
    detalhes && detalhes.original_title
  ].join(" "));

  let risco = 35;

  const gruposMuitoAltos = [
    "crunchyroll",
    "toei",
    "disney",
    "warner",
    "hbo",
    "max",
    "netflix",
    "universal",
    "paramount",
    "sony",
    "columbia",
    "20th century",
    "twentieth century",
    "fox",
    "lionsgate",
    "mgm",
    "amazon",
    "prime video",
    "apple tv"
  ];

  const gruposAltos = [
    "adult swim",
    "cartoon network",
    "nickelodeon",
    "dreamworks",
    "illumination",
    "pixar",
    "marvel",
    "lucasfilm",
    "dc entertainment",
    "toho",
    "funimation",
    "hulu",
    "peacock"
  ];

  const gruposMedios = [
    "bbc",
    "amc",
    "starz",
    "showtime",
    "the cw",
    "cbs",
    "nbc",
    "abc",
    "fx",
    "fxx",
    "mtv"
  ];

  for (const termo of gruposMuitoAltos) {
    if (texto.includes(termo)) {
      risco += 35;
      break;
    }
  }

  for (const termo of gruposAltos) {
    if (texto.includes(termo)) {
      risco += 25;
      break;
    }
  }

  for (const termo of gruposMedios) {
    if (texto.includes(termo)) {
      risco += 15;
      break;
    }
  }

  const anoAtual = new Date().getFullYear();
  const anoNum = Number(ano);

  if (anoNum && anoNum >= anoAtual - 2) {
    risco += 20;
  } else if (anoNum && anoNum >= anoAtual - 8) {
    risco += 12;
  } else if (anoNum && anoNum < 1995) {
    risco -= 5;
  }

  const pop = Number(popularidade || 0);

  if (pop >= 150) {
    risco += 15;
  } else if (pop >= 80) {
    risco += 10;
  } else if (pop >= 30) {
    risco += 5;
  }

  const isAnimeOuDesenho = detectarAnimeOuDesenho(detalhes || {}, tipo);

  if (isAnimeOuDesenho) {
    risco += 10;

    if (
      texto.includes("crunchyroll") ||
      texto.includes("toei") ||
      texto.includes("funimation") ||
      texto.includes("tv tokyo") ||
      texto.includes("fuji tv")
    ) {
      risco += 15;
    }
  }

  if (!copyrightTexto) {
    risco = 45;
  }

  if (risco < 10) risco = 10;
  if (risco > 98) risco = 98;

  let nivel = "Baixo";

  if (risco >= 86) {
    nivel = "Muito alto";
  } else if (risco >= 61) {
    nivel = "Alto";
  } else if (risco >= 31) {
    nivel = "Médio";
  }

  return {
    porcentagem: risco,
    nivel
  };
}

function montarRespostaCopyright(icone, nome, copyrightTexto, risco) {
  const emote = limparTexto(EMOTE_COPYRIGHT);

  if (!copyrightTexto) {
    return `${icone} ${nome}. Possível copyright: não encontrado. Risco: ${risco.porcentagem}% - ${risco.nivel}.`;
  }

  if (emote) {
    return `${icone} ${nome}. Possível copyright: ${emote} ${copyrightTexto}. Risco: ${risco.porcentagem}% - ${risco.nivel}.`;
  }

  return `${icone} ${nome}. Possível copyright: ${copyrightTexto}. Risco: ${risco.porcentagem}% - ${risco.nivel}.`;
}

app.get("/api/empresas", async (req, res) => {
  try {
    const canalRecebido = req.query.channel;
    const usuarioRecebido = req.query.user;
    const titulo = limparTexto(req.query.titulo);
    const tipoForcado = limparTexto(req.query.tipo).toLowerCase();

    const permissaoCanal = canalEstaPermitido(canalRecebido);

    if (!permissaoCanal.ok) {
      return res.send(permissaoCanal.erro);
    }

    const bloqueioUsuario = usuarioEstaBloqueado(usuarioRecebido);

    if (bloqueioUsuario.bloqueado) {
      return res.send(bloqueioUsuario.erro);
    }

    if (!titulo) {
      return res.send("Use assim: !copyright nome do filme ou série");
    }

    if (!TMDB_KEY) {
      return res.send("Erro: TMDB_KEY não configurada no Render.");
    }

    const buscaFilmeUrl =
      "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`;

    const buscaSerieUrl =
      "https://api.themoviedb.org/3/search/tv" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false`;

    const [buscaFilme, buscaSerie] = await Promise.all([
      tmdbGet(buscaFilmeUrl),
      tmdbGet(buscaSerieUrl)
    ]);

    const filme = buscaFilme.results && buscaFilme.results[0] ? buscaFilme.results[0] : null;
    const serie = buscaSerie.results && buscaSerie.results[0] ? buscaSerie.results[0] : null;

    const escolhido = escolherMelhorResultado(filme, serie, tipoForcado);

    if (!escolhido.item) {
      return res.send(`Não achei "${titulo}" no TMDB.`);
    }

    if (escolhido.tipo === "filme") {
      const detalhesFilmeUrl =
        `https://api.themoviedb.org/3/movie/${escolhido.item.id}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}` +
        `&language=pt-BR`;

      const watchProvidersUrl =
        `https://api.themoviedb.org/3/movie/${escolhido.item.id}/watch/providers` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}`;

      const [detalhesFilme, watchProviders] = await Promise.all([
        tmdbGet(detalhesFilmeUrl),
        tmdbGet(watchProvidersUrl)
      ]);

      const ano = escolhido.item.release_date ? escolhido.item.release_date.slice(0, 4) : "sem ano";
      const nomeBase = detalhesFilme.title || escolhido.item.title || titulo;
      const nome = `${nomeBase} (${ano})`;

      const empresas = nomesUnicos(detalhesFilme.production_companies || []);
      const providers = extrairProviders(watchProviders);
      const copyrightTexto = montarPossiveisCopyright(empresas, providers);

      const risco = calcularRiscoCopyright({
        tipo: "filme",
        ano,
        popularidade: escolhido.item.popularity,
        copyrightTexto,
        providers,
        detalhes: detalhesFilme
      });

      return res.send(montarRespostaCopyright("🎬", nome, copyrightTexto, risco));
    }

    if (escolhido.tipo === "serie") {
      const detalhesSerieUrl =
        `https://api.themoviedb.org/3/tv/${escolhido.item.id}` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}` +
        `&language=pt-BR`;

      const watchProvidersUrl =
        `https://api.themoviedb.org/3/tv/${escolhido.item.id}/watch/providers` +
        `?api_key=${encodeURIComponent(TMDB_KEY)}`;

      const [detalhesSerie, watchProviders] = await Promise.all([
        tmdbGet(detalhesSerieUrl),
        tmdbGet(watchProvidersUrl)
      ]);

      const nome = detalhesSerie.name || escolhido.item.name || titulo;

      const empresasSerie = [
        ...(detalhesSerie.networks || []),
        ...(detalhesSerie.production_companies || [])
      ];

      const empresas = nomesUnicos(empresasSerie);
      const providers = extrairProviders(watchProviders);
      const copyrightTexto = montarPossiveisCopyright(empresas, providers);

      const primeiroAno = detalhesSerie.first_air_date
        ? detalhesSerie.first_air_date.slice(0, 4)
        : "";

      const risco = calcularRiscoCopyright({
        tipo: "serie",
        ano: primeiroAno,
        popularidade: escolhido.item.popularity,
        copyrightTexto,
        providers,
        detalhes: detalhesSerie
      });

      return res.send(montarRespostaCopyright("📺", nome, copyrightTexto, risco));
    }

    return res.send(`Não achei possível copyright para "${titulo}".`);
  } catch (err) {
    console.error(err);
    return res.send("Erro ao consultar possível copyright no TMDB.");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
