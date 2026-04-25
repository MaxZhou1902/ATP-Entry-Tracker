import React, { useEffect, useMemo, useState } from "https://esm.sh/react@18.3.1";
import { createRoot } from "https://esm.sh/react-dom@18.3.1/client";

function App() {
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("./data/entries.json", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Failed to load data: ${res.status}`);
        }
        const data = await res.json();
        setPayload(data);
      } catch (e) {
        setError(e.message || "Failed to load data.");
      } finally {
        setLoading(false);
      }
    }

    load();
  }, []);

  const players = useMemo(() => {
    const list = payload?.players || [];
    const q = keyword.trim().toLowerCase();
    if (!q) return list;

    return list.filter((player) => {
      return (
        String(player.rank).includes(q) ||
        player.name.toLowerCase().includes(q) ||
        player.country3.toLowerCase().includes(q)
      );
    });
  }, [payload, keyword]);

  if (loading) {
    return React.createElement("main", { className: "container" }, React.createElement("p", null, "Loading ATP entries..."));
  }

  if (error) {
    return React.createElement("main", { className: "container" }, React.createElement("p", { className: "error" }, error));
  }

  const columns = payload.columns || [];

  return React.createElement(
    "main",
    { className: "container" },
    React.createElement("h1", null, "ATP Entry Tracker"),
    React.createElement(
      "p",
      { className: "meta" },
      `Source: ${payload.source} | Updated: ${new Date(payload.fetchedAt).toLocaleString()}`
    ),
    React.createElement("input", {
      className: "search",
      placeholder: "Search by rank / player / country",
      value: keyword,
      onChange: (e) => setKeyword(e.target.value),
    }),
    React.createElement(
      "div",
      { className: "table-wrap" },
      React.createElement(
        "table",
        null,
        React.createElement(
          "thead",
          null,
          React.createElement(
            "tr",
            null,
            React.createElement("th", null, "Rank"),
            React.createElement("th", null, "Player"),
            ...columns.map((col) => React.createElement("th", { key: col }, col))
          )
        ),
        React.createElement(
          "tbody",
          null,
          ...players.map((player) =>
            React.createElement(
              "tr",
              { key: `${player.rank}-${player.name}` },
              React.createElement("td", null, player.rank),
              React.createElement(
                "td",
                { className: "player-cell" },
                React.createElement("span", { className: "flag" }, player.flag || "🏳️"),
                React.createElement("span", null, player.name)
              ),
              ...player.next4Weeks.map((week) =>
                React.createElement("td", { key: `${player.rank}-${week.date}` }, week.tournament || "-")
              )
            )
          )
        )
      )
    )
  );
}

createRoot(document.getElementById("root")).render(React.createElement(App));
