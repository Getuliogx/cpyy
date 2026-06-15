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

function separarTituloAnoETemporada(texto) {
  let titulo = limparTexto(texto);
  let ano = null;
  let temporada = null;

  // Aceita no final: T1, t1, S1, temporada 1, temp 1.
  // Exemplos: "perdidos no espaço 2018 T1", "lost temporada 2".
  const matchTemporadaExplicita = titulo.match(/^(.*?)\s+(?:t|s|temp|temporada)\s*\.?\s*(\d+)$/i);

  if (matchTemporadaExplicita) {
    titulo = limparTexto(matchTemporadaExplicita[1]);
    temporada = Number(matchTemporadaExplicita[2]);
  }

  // Aceita ano no final depois de remover a temporada.
  // Exemplos: "a mumia 1999", "perdidos no espaço 2018 T1".
  const matchAno = titulo.match(/^(.*?)\s+\(?((?:18|19|20|21)\d{2})\)?$/);

  if (matchAno) {
    titulo = limparTexto(matchAno[1]);
    ano = Number(matchAno[2]);
  }

  return {
    titulo,
    ano,
    temporada
  };
}

function anoDoFilme(item) {
  return item && item.release_date ? String(item.release_date).slice(0, 4) : "";
}

function anoDaSerie(item) {
  return item && item.first_air_date ? String(item.first_air_date).slice(0, 4) : "";
}

function escolherResultadoPorAno(resultados, ano, pegarAno) {
  if (!Array.isArray(resultados) || resultados.length === 0) {
    return null;
  }

  if (!ano) {
    return resultados[0];
  }

  const anoTexto = String(ano);
  return resultados.find(item => pegarAno(item) === anoTexto) || null;
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

function limparNomePlataforma(nomeRecebido) {
  let nome = limparTexto(nomeRecebido);

  if (!nome) {
    return "";
  }

  const textoNormalizado = normalizarTexto(nome);

  // Agrupa as variações com anúncio no nome principal da plataforma.
  // Exemplos:
  // "Netflix basic with Ads" -> "Netflix"
  // "Prime Video with Ads" -> "Prime Video"
  // "Amazon Prime Video with Ads" -> "Prime Video"
  if (textoNormalizado.includes("netflix")) return "Netflix";
  if (textoNormalizado.includes("prime video") || textoNormalizado.includes("amazon prime")) return "Prime Video";
  if (textoNormalizado.includes("disney")) return "Disney+";
  if (textoNormalizado.includes("paramount")) return "Paramount+";
  if (textoNormalizado.includes("crunchyroll")) return "Crunchyroll";
  if (textoNormalizado.includes("globoplay")) return "Globoplay";
  if (textoNormalizado.includes("apple tv")) return "Apple TV";
  if (textoNormalizado.includes("mubi")) return "MUBI";
  if (textoNormalizado.includes("telecine")) return "Telecine";
  if (textoNormalizado === "max" || textoNormalizado.includes("hbo max")) return "Max";

  // Limpeza genérica para outros provedores que venham com "ads/with ads/com anúncios".
  nome = nome
    .replace(/\bbasic\s+with\s+ads?\b/gi, "")
    .replace(/\bstandard\s+with\s+ads?\b/gi, "")
    .replace(/\bwith\s+ads?\b/gi, "")
    .replace(/\bwith\s+advertisements?\b/gi, "")
    .replace(/\bad[-\s]?supported\b/gi, "")
    .replace(/\bads?\b/gi, "")
    .replace(/\bcom\s+an[úu]ncios?\b/gi, "")
    .replace(/\bcom\s+publicidade\b/gi, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-:|]+$/g, "")
    .trim();

  return nome;
}

function nomesPlataformasUnicos(lista) {
  const nomes = [];

  for (const item of lista || []) {
    const nomeOriginal = typeof item === "string" ? item : item && item.provider_name;
    const nome = limparNomePlataforma(nomeOriginal);

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

  return nomesPlataformasUnicos(todos);
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
    detalhes && detalhes.original_title,
    detalhes && detalhes.status,
    ...(detalhes && detalhes.genres ? detalhes.genres.map(g => g.name) : []),
    ...(detalhes && detalhes.origin_country ? detalhes.origin_country : []),
    ...(detalhes && detalhes.production_countries ? detalhes.production_countries.map(p => p.name) : [])
  ].join(" "));

  const anoAtual = new Date().getFullYear();
  const anoNum = Number(ano);
  const idade = anoNum ? Math.max(0, anoAtual - anoNum) : null;
  const pop = Number(popularidade || (detalhes && detalhes.popularity) || 0);
  const votos = Number((detalhes && detalhes.vote_count) || 0);
  const qtdProviders = nomesUnicos(providers || []).length;
  const temEmpresasOuProviders = Boolean(limparTexto(copyrightTexto)) || qtdProviders > 0;

  let risco = temEmpresasOuProviders ? 26 : 20;

  function contemAlgum(lista) {
    return lista.some(termo => texto.includes(termo));
  }

  // Peso principal: empresas/streamings que costumam ter detecção e bloqueio mais forte.
  // Usa o MAIOR peso encontrado, em vez de somar tudo e inflar demais a porcentagem.
  const grupos = [
    {
      peso: 42,
      termos: [
        "disney", "pixar", "marvel", "lucasfilm", "20th century", "twentieth century",
        "warner", "hbo", "max", "dc entertainment",
        "universal", "dreamworks", "illumination",
        "paramount", "nickelodeon", "mtv",
        "netflix", "sony", "columbia", "amazon", "prime video", "apple tv"
      ]
    },
    {
      peso: 38,
      termos: [
        "crunchyroll", "toei", "funimation", "aniplex", "viz media", "tv tokyo",
        "fuji tv", "toho", "kadokawa", "bandai", "shueisha", "kodansha"
      ]
    },
    {
      peso: 32,
      termos: [
        "lionsgate", "mgm", "metro goldwyn mayer", "peacock", "hulu", "adult swim",
        "cartoon network", "cartoon", "boomerang", "discovery", "national geographic"
      ]
    },
    {
      peso: 24,
      termos: [
        "bbc", "amc", "starz", "showtime", "the cw", "cbs", "nbc", "abc", "fx", "fxx",
        "fox", "globoplay", "telecine", "mubi", "paramount+", "disney+"
      ]
    },
    {
      peso: 14,
      termos: [
        "studio", "studios", "pictures", "films", "television", "network", "productions", "animation"
      ]
    }
  ];

  let maiorPesoGrupo = 0;
  for (const grupo of grupos) {
    if (contemAlgum(grupo.termos)) {
      maiorPesoGrupo = Math.max(maiorPesoGrupo, grupo.peso);
    }
  }
  risco += maiorPesoGrupo;

  // Plataformas disponíveis aumentam o risco, mas com limite para não virar 98% em tudo.
  if (qtdProviders >= 6) {
    risco += 16;
  } else if (qtdProviders >= 3) {
    risco += 12;
  } else if (qtdProviders >= 1) {
    risco += 8;
  }

  // Ano: conteúdo recente tende a ser mais protegido/monitorado; conteúdo muito antigo reduz um pouco.
  if (idade !== null) {
    if (idade <= 1) {
      risco += 18;
    } else if (idade <= 4) {
      risco += 15;
    } else if (idade <= 9) {
      risco += 11;
    } else if (idade <= 20) {
      risco += 7;
    } else if (idade <= 35) {
      risco += 3;
    } else if (idade >= 90 && maiorPesoGrupo < 30 && qtdProviders === 0) {
      risco -= 18;
    } else if (idade >= 70 && maiorPesoGrupo < 30 && qtdProviders === 0) {
      risco -= 12;
    } else if (idade >= 45 && maiorPesoGrupo < 30) {
      risco -= 6;
    }
  }

  // Popularidade do TMDb varia muito; escala logarítmica deixa o valor mais estável.
  if (pop > 0) {
    risco += Math.min(16, Math.round(Math.log10(pop + 1) * 7));
  }

  // Vote count ajuda a diferenciar obra muito conhecida de obra pouco conhecida.
  if (votos >= 10000) {
    risco += 8;
  } else if (votos >= 3000) {
    risco += 6;
  } else if (votos >= 800) {
    risco += 4;
  } else if (votos >= 150) {
    risco += 2;
  }

  const isAnimeOuDesenho = detectarAnimeOuDesenho(detalhes || {}, tipo);

  if (isAnimeOuDesenho) {
    risco += 6;

    if (contemAlgum(["crunchyroll", "toei", "funimation", "aniplex", "tv tokyo", "fuji tv", "shueisha", "kodansha"])) {
      risco += 8;
    }
  }

  if (detalhes && detalhes.belongs_to_collection) {
    risco += 5;
  }

  // Se não achou empresa nem streaming, não força porcentagem alta só por existir no TMDb.
  if (!temEmpresasOuProviders) {
    risco = Math.min(risco, 58);
  }

  if (risco < 8) risco = 8;
  if (risco > 98) risco = 98;

  risco = Math.round(risco);

  let nivel = "Baixo";

  if (risco >= 82) {
    nivel = "Muito alto";
  } else if (risco >= 60) {
    nivel = "Alto";
  } else if (risco >= 32) {
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
    const entrada = limparTexto(req.query.titulo);
    const tipoForcado = limparTexto(req.query.tipo).toLowerCase();

    const permissaoCanal = canalEstaPermitido(canalRecebido);

    if (!permissaoCanal.ok) {
      return res.send(permissaoCanal.erro);
    }

    const bloqueioUsuario = usuarioEstaBloqueado(usuarioRecebido);

    if (bloqueioUsuario.bloqueado) {
      return res.send(bloqueioUsuario.erro);
    }

    if (!entrada) {
      return res.send("Use assim: !copyright nome do filme 1999 ou !copyright nome da série 2018 T1");
    }

    if (!TMDB_KEY) {
      return res.send("Erro: TMDB_KEY não configurada no Render.");
    }

    const { titulo, ano, temporada } = separarTituloAnoETemporada(entrada);

    if (!titulo) {
      return res.send("Digite o nome do filme, série, anime ou desenho.");
    }

    const buscaFilmeUrl =
      "https://api.themoviedb.org/3/search/movie" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&primary_release_year=${encodeURIComponent(ano)}` : "");

    const buscaSerieUrl =
      "https://api.themoviedb.org/3/search/tv" +
      `?api_key=${encodeURIComponent(TMDB_KEY)}` +
      `&language=pt-BR` +
      `&query=${encodeURIComponent(titulo)}` +
      `&include_adult=false` +
      (ano ? `&first_air_date_year=${encodeURIComponent(ano)}` : "");

    const [buscaFilme, buscaSerie] = await Promise.all([
      tmdbGet(buscaFilmeUrl),
      tmdbGet(buscaSerieUrl)
    ]);

    const filme = escolherResultadoPorAno(buscaFilme.results, ano, anoDoFilme);
    const serie = escolherResultadoPorAno(buscaSerie.results, ano, anoDaSerie);
    const tipoParaEscolher = temporada !== null ? "serie" : tipoForcado;

    const escolhido = escolherMelhorResultado(filme, serie, tipoParaEscolher);

    if (!escolhido.item) {
      return res.send(`Não achei "${titulo}"${ano ? ` de ${ano}` : ""} no TMDB.`);
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

      const primeiroAno = anoDaSerie(detalhesSerie) || anoDaSerie(escolhido.item);
      const nomeBase = detalhesSerie.name || escolhido.item.name || titulo;
      const nome = `${nomeBase}${primeiroAno ? ` (${primeiroAno})` : ""}${temporada !== null ? ` - T${temporada}` : ""}`;

      const empresasSerie = [
        ...(detalhesSerie.networks || []),
        ...(detalhesSerie.production_companies || [])
      ];

      const empresas = nomesUnicos(empresasSerie);
      const providers = extrairProviders(watchProviders);
      const copyrightTexto = montarPossiveisCopyright(empresas, providers);

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
