import { redirect } from "next/navigation";

// O cadastro mora na página inicial. Este endereço continua valendo para
// quem já recebeu o link antigo.
export default function Cadastro() {
  redirect("/#cadastro");
}
