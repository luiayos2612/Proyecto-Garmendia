--
-- PostgreSQL database dump
--

\restrict 8bYPocr74R7XfPmg0x5ljKFWtzJMTYiivPnZb1BF1N8bxwyyrWUKSUpD7YFXWgL

-- Dumped from database version 15.14
-- Dumped by pg_dump version 15.14

-- Started on 2026-06-01 18:17:30 -04

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- TOC entry 2 (class 3079 OID 24587)
-- Name: uuid-ossp; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA public;


--
-- TOC entry 3819 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION "uuid-ossp"; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION "uuid-ossp" IS 'generate universally unique identifiers (UUIDs)';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 220 (class 1259 OID 24678)
-- Name: asignaciones_docentes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.asignaciones_docentes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    docente_id uuid,
    materia_id uuid,
    ano_escolar character varying(10) DEFAULT '2025-2026'::character varying,
    activa boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    periodo_id integer
);


ALTER TABLE public.asignaciones_docentes OWNER TO postgres;

--
-- TOC entry 215 (class 1259 OID 24598)
-- Name: auditoria; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.auditoria (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    tabla_afectada character varying(50) NOT NULL,
    accion character varying(10) NOT NULL,
    usuario_id character varying(100),
    datos_nuevos jsonb,
    fecha_hora timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT auditoria_accion_check CHECK (((accion)::text = ANY ((ARRAY['INSERT'::character varying, 'UPDATE'::character varying, 'DELETE'::character varying])::text[])))
);


ALTER TABLE public.auditoria OWNER TO postgres;

--
-- TOC entry 221 (class 1259 OID 24951)
-- Name: calificaciones; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.calificaciones (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    materia_id uuid NOT NULL,
    docente_id uuid NOT NULL,
    asignacion_id uuid NOT NULL,
    nota numeric(4,2),
    observaciones text,
    fecha_cierre timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT calificaciones_nota_check CHECK (((nota >= (0)::numeric) AND (nota <= (20)::numeric)))
);


ALTER TABLE public.calificaciones OWNER TO postgres;

--
-- TOC entry 226 (class 1259 OID 25142)
-- Name: configuracion; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.configuracion (
    clave character varying(50) NOT NULL,
    valor text NOT NULL,
    descripcion text
);


ALTER TABLE public.configuracion OWNER TO postgres;

--
-- TOC entry 225 (class 1259 OID 25121)
-- Name: cuotas; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cuotas (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    concepto character varying(100) NOT NULL,
    monto numeric(10,2) NOT NULL,
    fecha_vencimiento date NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying,
    pago_id uuid,
    mes integer,
    ano integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cuotas_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'pagada'::character varying, 'vencida'::character varying])::text[])))
);


ALTER TABLE public.cuotas OWNER TO postgres;

--
-- TOC entry 230 (class 1259 OID 25279)
-- Name: cupos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.cupos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    periodo_origen integer NOT NULL,
    periodo_destino integer NOT NULL,
    estado character varying(20) DEFAULT 'pendiente'::character varying NOT NULL,
    pagos_solvencia boolean DEFAULT false,
    materias_aprobadas boolean DEFAULT false,
    promedio_general numeric(4,2),
    observaciones text,
    fecha_aprobacion timestamp without time zone,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT cupos_estado_check CHECK (((estado)::text = ANY (ARRAY[('pendiente'::character varying)::text, ('aprobado'::character varying)::text, ('rechazado'::character varying)::text])))
);


ALTER TABLE public.cupos OWNER TO postgres;

--
-- TOC entry 3820 (class 0 OID 0)
-- Dependencies: 230
-- Name: TABLE cupos; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.cupos IS 'Estudiantes aprobados académicamente pendientes de aprobación de cupo por el director';


--
-- TOC entry 218 (class 1259 OID 24651)
-- Name: docentes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.docentes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    usuario_id uuid,
    cedula character varying(20) NOT NULL,
    apellidos character varying(100) NOT NULL,
    nombres character varying(100) NOT NULL,
    especialidad character varying(100),
    telefono character varying(20),
    email character varying(100),
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.docentes OWNER TO postgres;

--
-- TOC entry 217 (class 1259 OID 24632)
-- Name: estudiantes; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.estudiantes (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    cedula_escolar character varying(20),
    apellidos character varying(100) NOT NULL,
    nombres character varying(100) NOT NULL,
    fecha_nacimiento date,
    genero character varying(10),
    fecha_ingreso date DEFAULT CURRENT_DATE,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    cedula character varying(20) NOT NULL,
    estado character varying(20) DEFAULT 'verificacion'::character varying,
    periodo_id integer,
    email character varying(100),
    fecha_inicio_periodo_actual date DEFAULT CURRENT_DATE,
    CONSTRAINT chk_estudiante_estado CHECK (((estado)::text = ANY ((ARRAY['activo'::character varying, 'verificacion'::character varying, 'deuda'::character varying])::text[]))),
    CONSTRAINT estudiantes_genero_check CHECK (((genero)::text = ANY ((ARRAY['Masculino'::character varying, 'Femenino'::character varying])::text[])))
);


ALTER TABLE public.estudiantes OWNER TO postgres;

--
-- TOC entry 3821 (class 0 OID 0)
-- Dependencies: 217
-- Name: COLUMN estudiantes.fecha_inicio_periodo_actual; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.estudiantes.fecha_inicio_periodo_actual IS 'Fecha de inicio del periodo actual. Se actualiza cuando el estudiante es aprobado y pasa a un nuevo período.';


--
-- TOC entry 229 (class 1259 OID 25255)
-- Name: historial_academico; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.historial_academico (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    periodo_id integer NOT NULL,
    materia_id uuid NOT NULL,
    promedio numeric(4,2),
    estado_materia character varying(20) DEFAULT 'aprobada'::character varying,
    ano_escolar character varying(10) DEFAULT '2025-2026'::character varying,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    nota numeric(4,2)
);


ALTER TABLE public.historial_academico OWNER TO postgres;

--
-- TOC entry 3822 (class 0 OID 0)
-- Dependencies: 229
-- Name: TABLE historial_academico; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON TABLE public.historial_academico IS 'Registro histórico de notas por periodo cuando un estudiante avanza de año';


--
-- TOC entry 223 (class 1259 OID 25076)
-- Name: inscripciones_materias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.inscripciones_materias (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    materia_id uuid NOT NULL,
    ano_escolar character varying(10) DEFAULT '2025-2026'::character varying,
    activa boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    periodo_id integer
);


ALTER TABLE public.inscripciones_materias OWNER TO postgres;

--
-- TOC entry 222 (class 1259 OID 25062)
-- Name: materia_grado; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.materia_grado (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    materia_id uuid NOT NULL,
    grado character varying(30) NOT NULL,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.materia_grado OWNER TO postgres;

--
-- TOC entry 219 (class 1259 OID 24666)
-- Name: materias; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.materias (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    codigo character varying(20) NOT NULL,
    nombre character varying(100) NOT NULL,
    descripcion text,
    grados_aplicables character varying(50),
    activa boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    nivel character varying(20) DEFAULT 'ambos'::character varying
);


ALTER TABLE public.materias OWNER TO postgres;

--
-- TOC entry 224 (class 1259 OID 25103)
-- Name: pagos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.pagos (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    estudiante_id uuid NOT NULL,
    tipo character varying(20) NOT NULL,
    concepto character varying(100) NOT NULL,
    monto numeric(10,2) NOT NULL,
    metodo_pago character varying(50) NOT NULL,
    referencia character varying(100),
    fecha_pago date DEFAULT CURRENT_DATE NOT NULL,
    estado character varying(20) DEFAULT 'verificacion'::character varying,
    observaciones text,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    monto_original_usd numeric(10,2),
    descuento_aplicado numeric(10,2),
    monto_bs numeric(15,2),
    tasa_cambio_usada numeric(10,4),
    periodo_id integer,
    CONSTRAINT pagos_estado_check CHECK (((estado)::text = ANY ((ARRAY['pendiente'::character varying, 'verificacion'::character varying, 'confirmado'::character varying, 'rechazado'::character varying])::text[]))),
    CONSTRAINT pagos_tipo_check CHECK (((tipo)::text = ANY ((ARRAY['inscripcion'::character varying, 'mensualidad'::character varying, 'otro'::character varying])::text[])))
);


ALTER TABLE public.pagos OWNER TO postgres;

--
-- TOC entry 3823 (class 0 OID 0)
-- Dependencies: 224
-- Name: COLUMN pagos.periodo_id; Type: COMMENT; Schema: public; Owner: postgres
--

COMMENT ON COLUMN public.pagos.periodo_id IS 'ID del período al que pertenece el pago. Usado para sistema semestral.
Permite diferenciar pagos de diferentes períodos del mismo estudiante.';


--
-- TOC entry 228 (class 1259 OID 25169)
-- Name: periodo_materia; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodo_materia (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    periodo_id integer NOT NULL,
    materia_id uuid NOT NULL,
    es_obligatoria boolean DEFAULT true,
    orden integer,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.periodo_materia OWNER TO postgres;

--
-- TOC entry 227 (class 1259 OID 25158)
-- Name: periodos; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.periodos (
    numero integer NOT NULL,
    nombre character varying(50) NOT NULL,
    descripcion text,
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.periodos OWNER TO postgres;

--
-- TOC entry 216 (class 1259 OID 24608)
-- Name: usuarios; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.usuarios (
    id uuid DEFAULT public.uuid_generate_v4() NOT NULL,
    email character varying(100) NOT NULL,
    password_hash character varying(255) NOT NULL,
    nombre_completo character varying(200) NOT NULL,
    rol character varying(20),
    activo boolean DEFAULT true,
    created_at timestamp without time zone DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT usuarios_rol_check CHECK (((rol)::text = ANY ((ARRAY['director'::character varying, 'docente'::character varying, 'secretaria'::character varying])::text[])))
);


ALTER TABLE public.usuarios OWNER TO postgres;

--
-- TOC entry 3592 (class 2606 OID 24687)
-- Name: asignaciones_docentes asignaciones_docentes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_docentes
    ADD CONSTRAINT asignaciones_docentes_pkey PRIMARY KEY (id);


--
-- TOC entry 3594 (class 2606 OID 25207)
-- Name: asignaciones_docentes asignaciones_docentes_unique_periodo; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_docentes
    ADD CONSTRAINT asignaciones_docentes_unique_periodo UNIQUE (docente_id, materia_id, periodo_id, ano_escolar);


--
-- TOC entry 3571 (class 2606 OID 24607)
-- Name: auditoria auditoria_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.auditoria
    ADD CONSTRAINT auditoria_pkey PRIMARY KEY (id);


--
-- TOC entry 3597 (class 2606 OID 25311)
-- Name: calificaciones calificacion_unica; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificacion_unica UNIQUE (estudiante_id, asignacion_id);


--
-- TOC entry 3599 (class 2606 OID 24961)
-- Name: calificaciones calificaciones_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_pkey PRIMARY KEY (id);


--
-- TOC entry 3625 (class 2606 OID 25148)
-- Name: configuracion configuracion_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.configuracion
    ADD CONSTRAINT configuracion_pkey PRIMARY KEY (clave);


--
-- TOC entry 3620 (class 2606 OID 25131)
-- Name: cuotas cuotas_estudiante_id_mes_ano_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT cuotas_estudiante_id_mes_ano_key UNIQUE (estudiante_id, mes, ano);


--
-- TOC entry 3622 (class 2606 OID 25129)
-- Name: cuotas cuotas_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT cuotas_pkey PRIMARY KEY (id);


--
-- TOC entry 3643 (class 2606 OID 25308)
-- Name: cupos cupos_estudiante_periodo_destino_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cupos
    ADD CONSTRAINT cupos_estudiante_periodo_destino_unique UNIQUE (estudiante_id, periodo_destino);


--
-- TOC entry 3645 (class 2606 OID 25291)
-- Name: cupos cupos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cupos
    ADD CONSTRAINT cupos_pkey PRIMARY KEY (id);


--
-- TOC entry 3584 (class 2606 OID 24660)
-- Name: docentes docentes_cedula_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_cedula_key UNIQUE (cedula);


--
-- TOC entry 3586 (class 2606 OID 24658)
-- Name: docentes docentes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_pkey PRIMARY KEY (id);


--
-- TOC entry 3577 (class 2606 OID 24645)
-- Name: estudiantes estudiantes_cedula_escolar_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_cedula_escolar_key UNIQUE (cedula_escolar);


--
-- TOC entry 3579 (class 2606 OID 25101)
-- Name: estudiantes estudiantes_cedula_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_cedula_key UNIQUE (cedula);


--
-- TOC entry 3581 (class 2606 OID 24643)
-- Name: estudiantes estudiantes_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT estudiantes_pkey PRIMARY KEY (id);


--
-- TOC entry 3637 (class 2606 OID 25263)
-- Name: historial_academico historial_academico_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_academico
    ADD CONSTRAINT historial_academico_pkey PRIMARY KEY (id);


--
-- TOC entry 3639 (class 2606 OID 25313)
-- Name: historial_academico historial_academico_unico; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_academico
    ADD CONSTRAINT historial_academico_unico UNIQUE (estudiante_id, periodo_id, materia_id);


--
-- TOC entry 3610 (class 2606 OID 25085)
-- Name: inscripciones_materias inscripciones_materias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inscripciones_materias
    ADD CONSTRAINT inscripciones_materias_pkey PRIMARY KEY (id);


--
-- TOC entry 3612 (class 2606 OID 25200)
-- Name: inscripciones_materias inscripciones_materias_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inscripciones_materias
    ADD CONSTRAINT inscripciones_materias_unique UNIQUE (estudiante_id, materia_id, periodo_id, ano_escolar);


--
-- TOC entry 3605 (class 2606 OID 25068)
-- Name: materia_grado materia_grado_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materia_grado
    ADD CONSTRAINT materia_grado_pkey PRIMARY KEY (id);


--
-- TOC entry 3607 (class 2606 OID 25070)
-- Name: materia_grado materia_grado_unique; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materia_grado
    ADD CONSTRAINT materia_grado_unique UNIQUE (materia_id, grado);


--
-- TOC entry 3588 (class 2606 OID 24677)
-- Name: materias materias_codigo_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materias
    ADD CONSTRAINT materias_codigo_key UNIQUE (codigo);


--
-- TOC entry 3590 (class 2606 OID 24675)
-- Name: materias materias_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materias
    ADD CONSTRAINT materias_pkey PRIMARY KEY (id);


--
-- TOC entry 3618 (class 2606 OID 25115)
-- Name: pagos pagos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_pkey PRIMARY KEY (id);


--
-- TOC entry 3633 (class 2606 OID 25178)
-- Name: periodo_materia periodo_materia_periodo_id_materia_id_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_materia
    ADD CONSTRAINT periodo_materia_periodo_id_materia_id_key UNIQUE (periodo_id, materia_id);


--
-- TOC entry 3635 (class 2606 OID 25176)
-- Name: periodo_materia periodo_materia_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_materia
    ADD CONSTRAINT periodo_materia_pkey PRIMARY KEY (id);


--
-- TOC entry 3628 (class 2606 OID 25168)
-- Name: periodos periodos_nombre_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodos
    ADD CONSTRAINT periodos_nombre_key UNIQUE (nombre);


--
-- TOC entry 3630 (class 2606 OID 25166)
-- Name: periodos periodos_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodos
    ADD CONSTRAINT periodos_pkey PRIMARY KEY (numero);


--
-- TOC entry 3573 (class 2606 OID 24620)
-- Name: usuarios usuarios_email_key; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_email_key UNIQUE (email);


--
-- TOC entry 3575 (class 2606 OID 24618)
-- Name: usuarios usuarios_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.usuarios
    ADD CONSTRAINT usuarios_pkey PRIMARY KEY (id);


--
-- TOC entry 3595 (class 1259 OID 25213)
-- Name: idx_asignaciones_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_asignaciones_periodo ON public.asignaciones_docentes USING btree (periodo_id);


--
-- TOC entry 3600 (class 1259 OID 24988)
-- Name: idx_calificaciones_asignacion; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calificaciones_asignacion ON public.calificaciones USING btree (asignacion_id);


--
-- TOC entry 3601 (class 1259 OID 24986)
-- Name: idx_calificaciones_docente; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calificaciones_docente ON public.calificaciones USING btree (docente_id);


--
-- TOC entry 3602 (class 1259 OID 24984)
-- Name: idx_calificaciones_estudiante; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calificaciones_estudiante ON public.calificaciones USING btree (estudiante_id);


--
-- TOC entry 3603 (class 1259 OID 24985)
-- Name: idx_calificaciones_materia; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_calificaciones_materia ON public.calificaciones USING btree (materia_id);


--
-- TOC entry 3626 (class 1259 OID 25156)
-- Name: idx_configuracion_clave; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_configuracion_clave ON public.configuracion USING btree (clave);


--
-- TOC entry 3623 (class 1259 OID 25151)
-- Name: idx_cuotas_estudiante; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cuotas_estudiante ON public.cuotas USING btree (estudiante_id);


--
-- TOC entry 3646 (class 1259 OID 25306)
-- Name: idx_cupos_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cupos_estado ON public.cupos USING btree (estado);


--
-- TOC entry 3647 (class 1259 OID 25305)
-- Name: idx_cupos_estudiante; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cupos_estudiante ON public.cupos USING btree (estudiante_id);


--
-- TOC entry 3648 (class 1259 OID 25304)
-- Name: idx_cupos_periodo_destino; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_cupos_periodo_destino ON public.cupos USING btree (periodo_destino);


--
-- TOC entry 3582 (class 1259 OID 25211)
-- Name: idx_estudiantes_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_estudiantes_periodo ON public.estudiantes USING btree (periodo_id);


--
-- TOC entry 3640 (class 1259 OID 25302)
-- Name: idx_historial_estudiante; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_historial_estudiante ON public.historial_academico USING btree (estudiante_id);


--
-- TOC entry 3641 (class 1259 OID 25303)
-- Name: idx_historial_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_historial_periodo ON public.historial_academico USING btree (periodo_id);


--
-- TOC entry 3608 (class 1259 OID 25212)
-- Name: idx_inscripciones_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_inscripciones_periodo ON public.inscripciones_materias USING btree (periodo_id);


--
-- TOC entry 3613 (class 1259 OID 25150)
-- Name: idx_pagos_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagos_estado ON public.pagos USING btree (estado);


--
-- TOC entry 3614 (class 1259 OID 25149)
-- Name: idx_pagos_estudiante; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagos_estudiante ON public.pagos USING btree (estudiante_id);


--
-- TOC entry 3615 (class 1259 OID 25155)
-- Name: idx_pagos_estudiante_estado; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagos_estudiante_estado ON public.pagos USING btree (estudiante_id, estado);


--
-- TOC entry 3616 (class 1259 OID 25316)
-- Name: idx_pagos_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_pagos_periodo ON public.pagos USING btree (periodo_id);


--
-- TOC entry 3631 (class 1259 OID 25214)
-- Name: idx_periodo_materia_periodo; Type: INDEX; Schema: public; Owner: postgres
--

CREATE INDEX idx_periodo_materia_periodo ON public.periodo_materia USING btree (periodo_id);


--
-- TOC entry 3651 (class 2606 OID 24690)
-- Name: asignaciones_docentes asignaciones_docentes_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_docentes
    ADD CONSTRAINT asignaciones_docentes_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.docentes(id);


--
-- TOC entry 3652 (class 2606 OID 24695)
-- Name: asignaciones_docentes asignaciones_docentes_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_docentes
    ADD CONSTRAINT asignaciones_docentes_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id);


--
-- TOC entry 3654 (class 2606 OID 24979)
-- Name: calificaciones calificaciones_asignacion_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_asignacion_id_fkey FOREIGN KEY (asignacion_id) REFERENCES public.asignaciones_docentes(id) ON DELETE CASCADE;


--
-- TOC entry 3655 (class 2606 OID 24974)
-- Name: calificaciones calificaciones_docente_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_docente_id_fkey FOREIGN KEY (docente_id) REFERENCES public.docentes(id) ON DELETE CASCADE;


--
-- TOC entry 3656 (class 2606 OID 24964)
-- Name: calificaciones calificaciones_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3657 (class 2606 OID 24969)
-- Name: calificaciones calificaciones_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.calificaciones
    ADD CONSTRAINT calificaciones_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id) ON DELETE CASCADE;


--
-- TOC entry 3663 (class 2606 OID 25132)
-- Name: cuotas cuotas_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT cuotas_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3664 (class 2606 OID 25137)
-- Name: cuotas cuotas_pago_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cuotas
    ADD CONSTRAINT cuotas_pago_id_fkey FOREIGN KEY (pago_id) REFERENCES public.pagos(id) ON DELETE SET NULL;


--
-- TOC entry 3670 (class 2606 OID 25292)
-- Name: cupos cupos_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cupos
    ADD CONSTRAINT cupos_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3671 (class 2606 OID 25297)
-- Name: cupos cupos_periodo_destino_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.cupos
    ADD CONSTRAINT cupos_periodo_destino_fkey FOREIGN KEY (periodo_destino) REFERENCES public.periodos(numero);


--
-- TOC entry 3650 (class 2606 OID 24661)
-- Name: docentes docentes_usuario_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.docentes
    ADD CONSTRAINT docentes_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES public.usuarios(id) ON DELETE SET NULL;


--
-- TOC entry 3653 (class 2606 OID 25201)
-- Name: asignaciones_docentes fk_asignaciones_periodo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.asignaciones_docentes
    ADD CONSTRAINT fk_asignaciones_periodo FOREIGN KEY (periodo_id) REFERENCES public.periodos(numero) ON DELETE CASCADE;


--
-- TOC entry 3649 (class 2606 OID 25189)
-- Name: estudiantes fk_estudiantes_periodo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.estudiantes
    ADD CONSTRAINT fk_estudiantes_periodo FOREIGN KEY (periodo_id) REFERENCES public.periodos(numero) ON DELETE SET NULL;


--
-- TOC entry 3659 (class 2606 OID 25194)
-- Name: inscripciones_materias fk_inscripciones_periodo; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inscripciones_materias
    ADD CONSTRAINT fk_inscripciones_periodo FOREIGN KEY (periodo_id) REFERENCES public.periodos(numero) ON DELETE CASCADE;


--
-- TOC entry 3667 (class 2606 OID 25264)
-- Name: historial_academico historial_academico_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_academico
    ADD CONSTRAINT historial_academico_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3668 (class 2606 OID 25274)
-- Name: historial_academico historial_academico_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_academico
    ADD CONSTRAINT historial_academico_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id);


--
-- TOC entry 3669 (class 2606 OID 25269)
-- Name: historial_academico historial_academico_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.historial_academico
    ADD CONSTRAINT historial_academico_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos(numero);


--
-- TOC entry 3660 (class 2606 OID 25088)
-- Name: inscripciones_materias inscripciones_materias_estudiante_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inscripciones_materias
    ADD CONSTRAINT inscripciones_materias_estudiante_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3661 (class 2606 OID 25093)
-- Name: inscripciones_materias inscripciones_materias_materia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.inscripciones_materias
    ADD CONSTRAINT inscripciones_materias_materia_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id);


--
-- TOC entry 3658 (class 2606 OID 25071)
-- Name: materia_grado materia_grado_materia_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.materia_grado
    ADD CONSTRAINT materia_grado_materia_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id) ON DELETE CASCADE;


--
-- TOC entry 3662 (class 2606 OID 25116)
-- Name: pagos pagos_estudiante_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.pagos
    ADD CONSTRAINT pagos_estudiante_id_fkey FOREIGN KEY (estudiante_id) REFERENCES public.estudiantes(id) ON DELETE CASCADE;


--
-- TOC entry 3665 (class 2606 OID 25184)
-- Name: periodo_materia periodo_materia_materia_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_materia
    ADD CONSTRAINT periodo_materia_materia_id_fkey FOREIGN KEY (materia_id) REFERENCES public.materias(id) ON DELETE CASCADE;


--
-- TOC entry 3666 (class 2606 OID 25179)
-- Name: periodo_materia periodo_materia_periodo_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.periodo_materia
    ADD CONSTRAINT periodo_materia_periodo_id_fkey FOREIGN KEY (periodo_id) REFERENCES public.periodos(numero) ON DELETE CASCADE;


-- Completed on 2026-06-01 18:17:30 -04

--
-- PostgreSQL database dump complete
--

\unrestrict 8bYPocr74R7XfPmg0x5ljKFWtzJMTYiivPnZb1BF1N8bxwyyrWUKSUpD7YFXWgL

