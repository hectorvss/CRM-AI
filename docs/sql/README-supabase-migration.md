# Supabase SQL Index

## Si tu proyecto Supabase es nuevo

Ejecuta en este orden:

1. [phase-0-0-supabase-full-baseline.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-0-supabase-full-baseline.sql)
2. [phase-0-1-supabase-runtime-delta.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-1-supabase-runtime-delta.sql)

## Si ya ejecutaste los scripts antiguos por fases

Ejecuta:

1. [phase-0-1-supabase-runtime-delta.sql](C:\Users\usuario\OneDrive%20-%20Universidad%20Politécnica%20de%20Cartagena\Documentos\Claude\Crm_Ai\docs\sql\phase-0-1-supabase-runtime-delta.sql)

## Scripts históricos

Los scripts `phase-1-*` a `phase-4-*` siguen siendo válidos como referencia histórica del roadmap, pero para dejar Supabase alineado con el runtime actual conviene tomar como fuente principal:

- `phase-0-0-supabase-full-baseline.sql`
- `phase-0-1-supabase-runtime-delta.sql`

## Importante

Estos scripts dejan Supabase estructuralmente listo.
El backend actual todavía usa SQLite, así que el siguiente bloque de trabajo será migrar el runtime de código para que lea y escriba en Supabase.
