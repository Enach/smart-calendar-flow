import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../contexts/AuthContext";

export default function Logout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    logout().finally(() => {
      navigate("/", { replace: true });
    });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  return null;
}
