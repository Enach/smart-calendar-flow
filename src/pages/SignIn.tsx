import Index from "./Index";

/** /signin → landing page with the auth dialog pre-opened in sign-in mode. */
export default function SignIn() {
  return <Index initialAuth="signin" />;
}
