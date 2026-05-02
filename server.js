const express = require("express");

const app = express();

const TMDB_KEY = process.env.TMDB_KEY;

const CANAIS_PERMITIDOS = process.env.CANAIS_PERMITIDOS || "";
const USUARIOS_BLOQUEADOS = process.env.USUARIOS_BLOQUEADOS || "";
const WATCH_REGION = process.env.WATCH_REGION || "BR";

app.get("/", (req, res) => {
  res.send("API TMDB empresas online.");
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

function formatarLista(lista, limite = 6) {
  const nomes = nomesUnicos(lista);

  if (nomes.length === 0) {
    return "";
  }

  return nomes.slice(0, limite).join(", ");
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
      return res.send("Use assim: !empresas nome do filme ou série");
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
      const nome = detalhesFilme.title || escolhido.item.title || titulo;

      const empresas = nomesUnicos(detalhesFilme.production_companies || []);
      const providers = extrairProviders(watchProviders);

      const empresasTexto = formatarLista(empresas, 6);
      const copyrightTexto = montarPossiveisCopyright(empresas, providers);

      let resposta = `🎬 ${nome} (${ano}).`;

      if (empresasTexto) {
        resposta += ` Empresas: ${empresasTexto}.`;
      } else {
        resposta += ` Empresas: não encontradas.`;
      }

      if (copyrightTexto) {
        resposta += ` Possível copyright icarol4No : ${copyrightTexto}. icarol4No `;
      }

      return res.send(resposta);
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

      const empresasTexto = formatarLista(empresas, 6);
      const copyrightTexto = montarPossiveisCopyright(empresas, providers);

      let resposta = `📺 ${nome}.`;

      if (empresasTexto) {
        resposta += ` Empresas: ${empresasTexto}.`;
      } else {
        resposta += ` Empresas: não encontradas.`;
      }

      if (copyrightTexto) {
        resposta += ` Possível copyright icarol4No : ${copyrightTexto}. icarol4No `;
      }

      return res.send(resposta);
    }

    return res.send(`Não achei empresas para "${titulo}".`);
  } catch (err) {
    console.error(err);
    return res.send("Erro ao consultar empresas no TMDB.");
  }
});

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
