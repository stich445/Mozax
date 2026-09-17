import { useEffect, useState } from "react";
import "./App.css";

function App() {
  const [balance, setBalance] = useState(0);
  const [token, setToken] = useState(() => localStorage.getItem("token"));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loginError, setLoginError] = useState("");
  const [loggingIn, setLoggingIn] = useState(false);
  const [transactions, setTransactions] = useState<any[]>([]);

  useEffect(() => {
    if (!token) return;

    fetch("/api/wallet", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setBalance(data.wallet.balanceNaira);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    if (!token) return;

    fetch("/api/wallet/transactions", {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setTransactions(data.transactions || []);
        }
      })
      .catch(() => {});
  }, [token]);

  useEffect(() => {
    const reference =
      new URLSearchParams(window.location.search).get("reference") ||
      new URLSearchParams(window.location.search).get("trxref");

    if (!reference || !token) return;

    fetch(`/api/wallet/verify/${encodeURIComponent(reference)}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((response) => response.json())
      .then(() => {
        return fetch("/api/wallet", {
          headers: { Authorization: `Bearer ${token}` },
        });
      })
      .then((response) => response.json())
      .then((data) => {
        if (data.success) {
          setBalance(data.wallet.balanceNaira);
        }
      })
      .catch(() => {});
  }, [token]);

  const handleLogin = async (event: React.FormEvent) => {
    event.preventDefault();
    setLoginError("");
    setLoggingIn(true);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ email, password }),
      });

      const data = await response.json();

      if (!response.ok || !data.token) {
        setLoginError(data.message || "Login failed");
        return;
      }

      localStorage.setItem("token", data.token);
      setToken(data.token);
    } catch {
      setLoginError("Unable to connect to server");
    } finally {
      setLoggingIn(false);
    }
  };

  if (!token) {
    return (
      <div className="app">
        <main style={{ maxWidth: "420px", margin: "60px auto", padding: "24px" }}>
          <h1>MOZAX</h1>
          <p>Simple. Fast. Nigerian.</p>

          <form onSubmit={handleLogin}>
            <div style={{ marginBottom: "16px" }}>
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Enter your email"
                required
                style={{ display: "block", width: "100%", padding: "12px", marginTop: "6px" }}
              />
            </div>

            <div style={{ marginBottom: "16px" }}>
              <label>Password</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter your password"
                required
                style={{ display: "block", width: "100%", padding: "12px", marginTop: "6px" }}
              />
            </div>

            {loginError && (
              <p style={{ color: "red" }}>{loginError}</p>
            )}

            <button type="submit" disabled={loggingIn}>
              {loggingIn ? "Logging in..." : "Log in"}
            </button>
          </form>
        </main>
      </div>
    );
  }

  return (
    <div className="app">
      <header className="header">
        <div>
          <h1>MOZAX</h1>
          <p>Simple. Fast. Nigerian.</p>
        </div>

        <button className="profile" onClick={() => { localStorage.removeItem("token"); window.location.reload(); }}>👤</button>
      </header>

      <main>
        <section className="balance-card">
          <p>Wallet Balance</p>
          <h2>₦{balance.toLocaleString()}</h2>

          <button
            className="fund-button"
            onClick={async () => { const amount = prompt("Enter amount in Naira"); if (!amount) return; const token = localStorage.getItem("token"); if (!token) { alert("Please log in first"); return; } const response = await fetch("/api/wallet/fund", { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ amount: Number(amount) }) }); const data = await response.json(); if (data.authorizationUrl) {
  if (data.reference) sessionStorage.setItem("pendingPaymentReference", data.reference);
  window.location.href = data.authorizationUrl;
} else {
  alert(data.message || "Unable to start payment");
} }}
          >
            + Fund Wallet
          </button>
        </section>

        <h3>Quick Services</h3>

        <div className="services">
          <button>
            <span>📱</span>
            Airtime
          </button>

          <button>
            <span>📶</span>
            Data
          </button>

          <button>
            <span>💡</span>
            Electricity
          </button>

          <button>
            <span>💸</span>
            Transfer
          </button>
        </div>

        <section className="transactions">
  <div className="section-title">
    <h3>Recent Transactions</h3>
    <button>See all</button>
  </div>

  {transactions.length === 0 ? (
    <p>No transactions yet.</p>
  ) : (
    transactions.slice(0, 5).map((transaction) => (
      <div className="transaction" key={transaction.id}>
        <div>
          <strong>{transaction.type}</strong>
          <small>
            {new Date(transaction.createdAt).toLocaleDateString()}
          </small>
        </div>
        <span className={transaction.amountKobo >= 0 ? "credit" : "debit"}>
          {transaction.amountKobo >= 0 ? "+" : "-"}₦
          {Math.abs(transaction.amountNaira).toLocaleString()}
        </span>
      </div>
    ))
  )}
</section>
</main>
</div>
  );
}

export default App;