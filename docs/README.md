# Bolao da Copa 2026

Aplicacao estatica para GitHub Pages com backend gratuito via Supabase.

## Publicar no GitHub Pages

1. Suba este repositorio para o GitHub.
2. Em `Settings > Pages`, escolha `Deploy from a branch`.
3. Selecione a branch principal e a pasta `/docs`.
4. Acesse a URL `https://seu-usuario.github.io/seu-repositorio/`.

## Ativar backend gratuito

1. Crie um projeto em `https://supabase.com`.
2. Rode o SQL em `supabase/schema.sql` no SQL Editor.
3. Em `Authentication > Providers`, deixe e-mail/senha ativo.
4. Copie `Project URL` e `anon public key`.
5. Cole esses dados no painel "Configurar GitHub Pages + Supabase" do site.
   O arquivo `docs/config.js` fica vazio por padrao para evitar publicar chaves no repositorio.
   Se optar por configurar automaticamente para todos os usuarios, lembre que qualquer chave usada no navegador ficara visivel no JavaScript publicado; a seguranca deve depender das politicas RLS do Supabase.

6. No Supabase, marque seu usuario como admin:

```sql
update public.profiles
set is_admin = true
where username = 'seu_usuario';
```

## Agenda dos jogos

O GitHub Pages nao deve guardar chaves privadas de API. Para importar jogos completos:

- use um JSON publico no formato aceito por `docs/app.js`; ou
- crie uma Supabase Edge Function que consulta uma API gratuita com segredo no servidor; ou
- use um provedor gratuito com chave publica/limite proprio e CORS liberado.

Este repositorio inclui a funcao `supabase/functions/sync-fixtures/index.ts`,
preparada para o plano gratuito da API-Football/API-SPORTS. No Supabase:

```powershell
supabase secrets set API_FOOTBALL_KEY=sua_chave
supabase functions deploy sync-fixtures
```

Depois, chame a funcao para gravar a agenda em `public.matches`.

Formato minimo do JSON:

```json
[
  {
    "id": "match-001",
    "match_number": 1,
    "stage": "Grupo A",
    "group_name": "Grupo A",
    "home_team": "Mexico",
    "away_team": "South Africa",
    "kickoff_utc": "2026-06-11T19:00:00.000Z",
    "venue": "Estadio Azteca",
    "city": "Mexico City"
  }
]
```

O arquivo `docs/data/worldcup-2026-seed.json` e uma carga inicial parcial para demonstracao. A agenda oficial completa deve ser importada antes de abrir o bolao.

## Regras implementadas

- palpite travado quando `kickoff_utc <= agora`;
- mensagem de bloqueio para jogo iniciado;
- placar exato: 5 pontos;
- vencedor ou empate correto: 3 pontos;
- gols corretos por equipe: +1 ponto por equipe quando nao for placar exato;
- ranking com desempate por placares exatos e acertos de vencedor/empate;
- resultados de penaltis ficam fora da modelagem;
- classificacao geral acessivel a todos os participantes;
- atualizacao da tabela apos cada rodada ou em periodicidade combinada;
- ranking exibe todos os palpiteiros inscritos, inclusive participantes ainda com 0 ponto;
- backend cria automaticamente perfis de novos usuarios e inclui no ranking usuarios ja cadastrados via backfill;
- placares reais devem ser atualizados 3 horas apos o inicio do jogo e passam a valer como oficiais para conferencia;
- casos omissos decididos pela organizacao, preservando transparencia e igualdade.
