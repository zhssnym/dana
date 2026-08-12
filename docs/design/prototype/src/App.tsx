import { ShellPage } from "@/screens/shell-page"
import { StatesPage } from "@/screens/states-page"
import {
  InviteGateScreen,
  LandingScreen,
  UnverifiedEmailScreen,
} from "@/screens/public-auth-screen"
import { TransactionalEmailScreen } from "@/screens/transactional-email-screen"

export function App() {
  const view = new URLSearchParams(window.location.search).get("view")

  if (view === "states") return <StatesPage />
  if (view === "landing") return <LandingScreen />
  if (view === "auth-unverified") return <UnverifiedEmailScreen />
  if (view === "invites") return <InviteGateScreen />
  if (view === "email") return <TransactionalEmailScreen />

  return <ShellPage />
}
