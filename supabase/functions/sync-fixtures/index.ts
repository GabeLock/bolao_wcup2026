import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    venue?: { name?: string; city?: string };
  };
  league?: { round?: string };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_FOOTBALL_KEY = Deno.env.get("API_FOOTBALL_KEY") ?? "";

Deno.serve(async () => {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !API_FOOTBALL_KEY) {
    return json({ error: "Missing Supabase or API_FOOTBALL_KEY secrets." }, 500);
  }

  const url = new URL("https://v3.football.api-sports.io/fixtures");
  url.searchParams.set("league", "1");
  url.searchParams.set("season", "2026");

  const fixturesResponse = await fetch(url, {
    headers: { "x-apisports-key": API_FOOTBALL_KEY }
  });

  if (!fixturesResponse.ok) {
    return json({ error: "Fixture API request failed.", status: fixturesResponse.status }, 502);
  }

  const payload = await fixturesResponse.json();
  const fixtures = Array.isArray(payload.response) ? payload.response as ApiFootballFixture[] : [];
  const matches = fixtures.map((item, index) => ({
    id: String(item.fixture.id),
    match_number: index + 1,
    stage: item.league?.round ?? "Copa do Mundo 2026",
    group_name: groupFromRound(item.league?.round),
    home_team: item.teams?.home?.name ?? "A definir",
    away_team: item.teams?.away?.name ?? "A definir",
    kickoff_utc: new Date(item.fixture.date).toISOString(),
    venue: item.fixture.venue?.name ?? "",
    city: item.fixture.venue?.city ?? "",
    source: "api-football"
  }));

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { error } = await supabase.from("matches").upsert(matches, { onConflict: "id" });

  if (error) return json({ error: error.message }, 500);
  return json({ imported: matches.length });
});

function groupFromRound(round?: string) {
  const match = round?.match(/Group\s+([A-L])/i);
  return match ? `Grupo ${match[1].toUpperCase()}` : null;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      "access-control-allow-origin": "*"
    }
  });
}
