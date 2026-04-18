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

1. Copie `.env.example` para `.env`.
2. Preencha:

```env
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```

3. Execute este SQL no Supabase:

```sql
create extension if not exists pgcrypto;

create table if not exists products (
	id uuid primary key default gen_random_uuid(),
	name text not null,
	category text not null,
	price numeric not null,
	old_price numeric,
	description text not null,
	active boolean not null default true,
	created_at timestamptz not null default now()
);
```

4. Crie um usuario admin no Supabase Auth para usar login na aba admin.

5. Configure em `Authentication > Providers` o login com Google e adicione `http://localhost:5173/` como redirect URL.

## Arquivos chave

- `src/App.tsx`: vitrine + painel admin.
- `src/lib/catalog.ts`: CRUD de produtos e login com fallback local.
- `src/types.ts`: tipagem de produto.
- `src/vite-env.d.ts`: tipagem de variaveis Vite.
