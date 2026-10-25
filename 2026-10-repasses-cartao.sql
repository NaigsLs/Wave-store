-- Wave Store 2.0 — integração de repasses de cartão
--
-- Este arquivo documenta as alterações aplicadas durante a sessão.
-- Aplique no Supabase apenas se o projeto ainda não possuir essas
-- funções/gatilhos. O script é reexecutável para funções/gatilhos,
-- mas deve ser revisado com o schema real antes de produção.
--
-- Pré-requisitos conferidos durante a sessão:
-- public.recebimentos contém taxa_cartao, data_prevista_repasse,
-- operadora_cartao, valor_liquido, forma, loja_id e id.
-- public.repasses_cartao contém os campos usados abaixo.

BEGIN;

-- Calcula a taxa a partir do bruto menos o líquido para débito/crédito.
CREATE OR REPLACE FUNCTION public.ws_normalizar_taxa_recebimento()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF NEW.forma IN ('credito', 'debito') THEN
        IF NEW.valor IS NULL
           OR NEW.valor_liquido IS NULL
           OR NEW.valor_liquido < 0
           OR NEW.valor_liquido > NEW.valor
        THEN
            RAISE EXCEPTION 'Valores do recebimento inválidos';
        END IF;

        NEW.taxa_cartao := ROUND(NEW.valor - NEW.valor_liquido, 2);
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ws_normalizar_taxa_recebimento
ON public.recebimentos;

CREATE TRIGGER trg_ws_normalizar_taxa_recebimento
BEFORE INSERT ON public.recebimentos
FOR EACH ROW
EXECUTE FUNCTION public.ws_normalizar_taxa_recebimento();

-- Cria um repasse pendente quando é inserido um recebimento no crédito.
CREATE OR REPLACE FUNCTION public.ws_criar_repasse_credito()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.forma = 'credito' THEN
        INSERT INTO public.repasses_cartao (
            loja_id,
            recebimento_id,
            valor_bruto,
            taxa,
            valor_liquido,
            previsao_repasse,
            status,
            operadora,
            observacao
        )
        VALUES (
            NEW.loja_id,
            NEW.id,
            NEW.valor,
            COALESCE(NEW.taxa_cartao, 0),
            NEW.valor_liquido,
            NEW.data_prevista_repasse,
            'pendente',
            NEW.operadora_cartao,
            'Repasse gerado automaticamente'
        );
    END IF;

    RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.ws_criar_repasse_credito()
FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_ws_criar_repasse_credito
ON public.recebimentos;

CREATE TRIGGER trg_ws_criar_repasse_credito
AFTER INSERT ON public.recebimentos
FOR EACH ROW
EXECUTE FUNCTION public.ws_criar_repasse_credito();

-- Permite consulta autenticada; a política RLS ws_repasses_consulta
-- continua limitando a leitura aos registros da própria loja.
GRANT SELECT ON TABLE public.repasses_cartao TO authenticated;

COMMIT;

-- Função confirmar_repasse_cartao já existia e foi testada na base.
-- Não a recriamos aqui para evitar sobrescrever uma implementação validada.
