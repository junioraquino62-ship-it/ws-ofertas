# ws-ofertas

Loja de ofertas com vitrine publica e painel admin para adicionar, retirar e excluir produtos.

## Scripts

- `npm run dev`: inicia o servidor local.
- `npm run build`: compila o projeto para producao.
- `npm run preview`: abre a build localmente.

## Como usar

1. Abra a aba `Vitrine` para ver apenas produtos ativos.
2. Abra a aba `Admin` para cadastrar produtos e gerenciar o catalogo.
3. Use `Retirar da vitrine` para ocultar sem excluir.
4. Use `Excluir` quando quiser remover de vez.

## Modos de dados

- Sem variaveis de ambiente: modo local, produtos salvos no navegador.
- Com Supabase configurado: dados persistidos em nuvem.

## Configurar Supabase

- Copie `.env.example` para `.env`.
- Preencha:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
VITE_FORCE_DISABLE_SUPABASE=false
# opcional (recomendado em producao):
VITE_PUBLIC_SITE_URL=https://seu-dominio.com
```

- Execute o SQL completo de [SETUP_SUPABASE.sql](SETUP_SUPABASE.sql) no SQL Editor do Supabase.
- Crie um usuario admin no Supabase Auth para usar login na aba admin.
- Se quiser acesso admin para esse usuario, execute no SQL Editor:

```sql
INSERT INTO public.admin_users (user_id)
SELECT id FROM auth.users WHERE email = 'admin@wsofertas.com'
ON CONFLICT (user_id) DO NOTHING;
```

- Configure Google no Supabase em Authentication > Providers > Google com Client ID/Secret.
- Em Authentication > URL Configuration, adicione em Redirect URLs:

- `http://localhost:5173/`
- `https://ws-ofertas.vercel.app/` (ou seu dominio final)

- No Google Cloud Console (OAuth client), inclua os callbacks do Supabase:

- Authorized redirect URI: `https://SEU_PROJECT_REF.supabase.co/auth/v1/callback`

- Se cadastro por e-mail estiver com confirmacao ativa, o usuario precisa confirmar o e-mail antes do primeiro login.
- O app agora cria o perfil automaticamente no primeiro login (inclusive via Google), caso ainda nao exista.

## Arquivos chave

- `src/App.tsx`: vitrine + painel admin.
- `src/lib/catalog.ts`: CRUD de produtos e login com fallback local.
- `src/types.ts`: tipagem de produto.
- `src/vite-env.d.ts`: tipagem de variaveis Vite.
