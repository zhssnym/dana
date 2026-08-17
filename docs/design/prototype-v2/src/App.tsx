import { ShellPage } from "@/screens/shell-page"
import { StatesPage } from "@/screens/states-page"
import {
  InviteGateScreen,
  LandingScreen,
  UnverifiedEmailScreen,
} from "@/screens/public-auth-screen"
import { TransactionalEmailScreen } from "@/screens/transactional-email-screen"
import { PublicLegalScreen } from "@/screens/public-legal-screen"
import { RowLabPage } from "@/screens/row-lab"

export function App() {
  const view = new URLSearchParams(window.location.search).get("view")

  if (view === "states") return <StatesPage />
  if (view === "landing") return <LandingScreen />
  if (view === "auth-unverified") return <UnverifiedEmailScreen />
  if (view === "invites") return <InviteGateScreen />
  if (view === "email") return <TransactionalEmailScreen />
  if (view === "rowlab") return <RowLabPage />
  if (view === "privacy") return <PublicLegalScreen page="privacy" />
  if (view === "terms") return <PublicLegalScreen page="terms" />

  return <ShellPage />
}
