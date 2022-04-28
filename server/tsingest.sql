CREATE EXTENSION IF NOT EXISTS timescaledb;

CREATE TABLE samples (
    "time" timestamp without time zone NOT NULL,
    source text NOT NULL,
    field text NOT NULL,
    value double precision,
    ingest_time timestamp without time zone NOT NULL
);

SELECT create_hypertable('samples','time');

-- Indexes
CREATE UNIQUE INDEX ON samples (source, field, "time" DESC);
CREATE INDEX weather_ingest_time_idx ON public.weather USING btree (ingest_time); -- what's this for??

-- First and last aggregation functions
CREATE OR REPLACE FUNCTION public.first_agg ( anyelement, anyelement )
RETURNS anyelement LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
        SELECT $1;
$$;
CREATE AGGREGATE public.first (
        sfunc    = public.first_agg,
        basetype = anyelement,
        stype    = anyelement
);
CREATE OR REPLACE FUNCTION public.last_agg ( anyelement, anyelement )
RETURNS anyelement LANGUAGE sql IMMUTABLE STRICT PARALLEL SAFE AS $$
        SELECT $2;
$$;
CREATE AGGREGATE public.last (
        sfunc    = public.last_agg,
        basetype = anyelement,
        stype    = anyelement
);
