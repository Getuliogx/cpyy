# cpyy

API TMDB para verificar possível copyright/empresas no StreamElements.

## Exemplos do comando

Filme com ano:

```text
!copyright a mumia 1999
```

Série/anime/desenho com ano:

```text
!copyright perdidos no espaço 2018
```

Série/anime/desenho com ano e temporada, para facilitar quando você quiser marcar a temporada no resultado:

```text
!copyright perdidos no espaço 2018 T1
```

Também aceita:

```text
!copyright perdidos no espaço 2018 t1
!copyright lost temporada 2
!copyright lost temp 2
```

## Observação

Números que fazem parte do nome continuam funcionando:

```text
!copyright Distrito 9
!copyright Distrito 9 2009
!copyright 1917 2019
```


## Plataformas com anúncios

As variações com anúncio agora são agrupadas no nome principal da plataforma.

Exemplos:

```text
Netflix basic with Ads -> Netflix
Netflix Standard with Ads -> Netflix
Prime Video with Ads -> Prime Video
Amazon Prime Video with Ads -> Prime Video
```


## Porcentagem de risco

A porcentagem foi ajustada para ficar mais coerente: agora considera empresas/plataformas com peso diferente, quantidade de plataformas, ano, popularidade, votos no TMDb, anime/desenho e franquia.

A resposta continua limpa, sem mostrar motivos:

```text
Possível copyright: empresa/plataforma. Risco: 90% - Muito alto.
```
