import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type ApiFootballFixture = {
  fixture: {
    id: number;
    date: string;
    status?: { short?: string; long?: string };
    venue?: { name?: string; city?: string };
  };
  league?: { round?: string };
  teams?: {
    home?: { name?: string };
    away?: { name?: string };
  };
  goals?: {
    home?: number | null;
    away?: number | null;
  };
};

type MatchRow = {
  id: string;
  match_number: number | null;
  home_team: string;
  away_team: string;
  kickoff_utc: string;
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const API_FOOTBALL_KEY = Deno.env.get("API_FOOTBALL_KEY") ?? "";
const RESULT_DELAY_MS = 3 * 60 * 60 * 1000;

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
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  const { data: matches, error: matchesError } = await supabase
    .from("matches")
    .select("id, match_number, home_team, away_team, kickoff_utc")
    .order("kickoff_utc", { ascending: true });

  if (matchesError) return json({ error: matchesError.message }, 500);

  const now = Date.now();
  const results = fixtures.flatMap((item) => {
    if (!hasOfficialGoals(item)) return [];
    const kickoff = new Date(item.fixture.date).getTime();
    if (now < kickoff + RESULT_DELAY_MS) return [];

    const match = findSeedMatch(item, matches ?? []);
    if (!match) return [];

    return [{
      match_id: match.id,
      home_goals: item.goals?.home ?? 0,
      away_goals: item.goals?.away ?? 0,
      updated_at: new Date().toISOString()
    }];
  });

  if (results.length) {
    const { error: resultsError } = await supabase.from("results").upsert(results, { onConflict: "match_id" });
    if (resultsError) return json({ error: resultsError.message }, 500);
  }

  return json({
    fixtures_seen: fixtures.length,
    seeded_matches_seen: matches?.length ?? 0,
    results_updated: results.length,
    result_match_ids: results.map((result) => result.match_id)
  });
});

function hasOfficialGoals(item: ApiFootballFixture) {
  return (
    typeof item.goals?.home === "number" &&
    typeof item.goals?.away === "number" &&
    !["NS", "TBD", "PST", "CANC", "ABD"].includes(item.fixture.status?.short ?? "")
  );
}

function findSeedMatch(item: ApiFootballFixture, matches: MatchRow[]) {
  const apiHome = normalizeTeam(item.teams?.home?.name ?? "");
  const apiAway = normalizeTeam(item.teams?.away?.name ?? "");
  const apiKickoff = new Date(item.fixture.date).getTime();

  return matches.find((match) => {
    const sameTeams =
      normalizeTeam(match.home_team) === apiHome &&
      normalizeTeam(match.away_team) === apiAway;
    const closeKickoff = Math.abs(new Date(match.kickoff_utc).getTime() - apiKickoff) <= 18 * 60 * 60 * 1000;
    return sameTeams && closeKickoff;
  });
}

function normalizeTeam(name: string) {
  const aliases: Record<string, string> = {
    "czechia": "czech republic",
    "korea republic": "south korea",
    "usa": "united states",
    "united states of america": "united states",
    "cote divoire": "ivory coast",
    "côte divoire": "ivory coast",
    "turkiye": "turkey",
    "türkiye": "turkey",
    "ir iran": "iran",
    "cabo verde": "cape verde",
    "congo dr": "dr congo"
  };
  const normalized = name
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return aliases[normalized] ?? normalized;
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
