import { Link } from "wouter";

export default function Footer() {
  const year = new Date().getFullYear();

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <h4>Kanhaa</h4>
            <p>Kid-approved snacks and combos that make mealtimes magical.</p>
            <div className="tags mt-4">
              <span className="tag tag--yellow">Freshly packed</span>
              <span className="tag tag--green">Kid approved</span>
            </div>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li>
                <Link
                  href="/terms-of-service"
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  data-testid="link-terms-of-service"
                >
                  Terms of service
                </Link>
              </li>
              <li>
                <Link
                  href="/refund-policy"
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  data-testid="link-refund-policy"
                >
                  Refund &amp; cancellation policy
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Team portals</h4>
            <ul>
              <li>
                <Link
                  href="/admin"
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  data-testid="button-admin"
                >
                  Admin dashboard
                </Link>
              </li>
              <li>
                <Link
                  href="/influencer"
                  className="rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-secondary focus-visible:ring-offset-2 focus-visible:ring-offset-white"
                  data-testid="button-influencer"
                >
                  Influencer lounge
                </Link>
              </li>
            </ul>
            <p className="mt-4 text-sm">Contact: +919890894335 · support@kanhaa.com</p>
          </div>
        </div>
        <div className="center mt-4 text-sm text-muted-foreground">
          © {year} Kanhaa · Sprinkling joy across India
        </div>
      </div>
    </footer>
  );
}