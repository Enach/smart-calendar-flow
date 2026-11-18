import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/useAuth";

export default function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  // SF-004: whether or not the server confirmed it, leave this blank route for
  // the home page. An unconfirmed sign-out keeps the user signed in there,
  // under the app-wide "Sign-out not confirmed" alert with its retry.
  useEffect(() => {
    void logout().finally(() => {
      navigate("/", { replace: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
