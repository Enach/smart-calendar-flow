import Index from "./Index";

/** /signup → landing page with the auth dialog pre-opened in sign-up mode. */
export default function SignUp() {
  return <Index initialAuth="signup" />;
}
