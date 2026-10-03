import {useEffect} from "react";
import {useAuth0} from "@auth0/auth0-react";
import {useRegisterCurrentUser} from "../../utils/queries.tsx";

/**
 * Registra el perfil del usuario autenticado en el directorio de la plataforma una vez por
 * sesión, para que los demás puedan encontrarlo al compartir un snippet.
 */
export const SessionBootstrap = () => {
  const {user} = useAuth0()
  const {mutate: registerCurrentUser} = useRegisterCurrentUser()

  useEffect(() => {
    if (!user?.sub) return
    registerCurrentUser({
      name: user.name ?? user.nickname ?? user.email ?? user.sub,
      email: user.email,
    })
  }, [user?.sub, user?.name, user?.nickname, user?.email, registerCurrentUser]);

  return null
}
