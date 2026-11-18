-- Additive only. Existing attempts, grades and sessions are not modified.
CREATE TABLE public.speech_processing_requests (
  request_id uuid PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES public.user_accounts(id) ON DELETE CASCADE,
  exercise_id bigint NOT NULL REFERENCES public.lesson_exercises(id) ON DELETE CASCADE,
  practice_session_id bigint NOT NULL REFERENCES public.practice_sessions(id) ON DELETE CASCADE,
  audio_hash text NOT NULL,
  target_text text NOT NULL,
  status text NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  attempt_id bigint REFERENCES public.speaking_attempts(id) ON DELETE SET NULL,
  error_code text,
  usage_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX speech_requests_user_created ON public.speech_processing_requests(user_id, created_at DESC);
CREATE TABLE public.speech_reference_cache (
  cache_key text PRIMARY KEY,
  created_by bigint REFERENCES public.user_accounts(id) ON DELETE SET NULL,
  status text NOT NULL CHECK (status IN ('processing','ready','failed')),
  object_key text NOT NULL,
  usage_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX speech_reference_created_by ON public.speech_reference_cache(created_by, created_at DESC);
ALTER TABLE public.speech_processing_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.speech_reference_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.speech_processing_requests, public.speech_reference_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.speech_processing_requests, public.speech_reference_cache TO service_role;

-- Serialize claims per user so concurrent failures cannot bypass the paid-call limit.
CREATE FUNCTION public.claim_speech_request(p_request_id uuid, p_user_id bigint, p_exercise_id bigint, p_session_id bigint, p_audio_hash text, p_target text)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE existing public.speech_processing_requests; recent integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('speech:' || p_user_id, 0));
  SELECT * INTO existing FROM public.speech_processing_requests WHERE request_id=p_request_id;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'request',to_jsonb(existing)); END IF;
  SELECT count(*) INTO recent FROM public.speech_processing_requests WHERE user_id=p_user_id AND created_at > now()-interval '1 minute';
  IF recent >= 10 THEN RAISE EXCEPTION 'SPEECH_RATE_LIMIT'; END IF;
  INSERT INTO public.speech_processing_requests(request_id,user_id,exercise_id,practice_session_id,audio_hash,target_text)
    VALUES(p_request_id,p_user_id,p_exercise_id,p_session_id,p_audio_hash,p_target) RETURNING * INTO existing;
  RETURN jsonb_build_object('claimed',true,'request',to_jsonb(existing));
END $$;

-- Attempt and request completion commit together; a retry can never insert a second attempt.
CREATE FUNCTION public.complete_speech_request(p_request_id uuid, p_result jsonb, p_provider text)
RETURNS bigint LANGUAGE plpgsql SET search_path = public AS $$
DECLARE job public.speech_processing_requests; attempt bigint; attempt_number integer; lesson bigint;
BEGIN
  SELECT * INTO job FROM public.speech_processing_requests WHERE request_id=p_request_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'REQUEST_NOT_FOUND'; END IF;
  IF job.status='completed' THEN RETURN job.attempt_id; END IF;
  IF job.status<>'processing' THEN RAISE EXCEPTION 'REQUEST_FAILED'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('speech:' || job.user_id, 0));
  SELECT lesson_id INTO lesson FROM public.practice_sessions WHERE id=job.practice_session_id AND user_id=job.user_id;
  IF lesson IS NULL THEN RAISE EXCEPTION 'SESSION_NOT_FOUND'; END IF;
  SELECT count(*)+1 INTO attempt_number FROM public.speaking_attempts WHERE user_id=job.user_id AND exercise_id=job.exercise_id;
  INSERT INTO public.speaking_attempts(user_id,lesson_id,exercise_id,practice_session_id,attempt_number,transcription,expected_text,conceptual_status,conceptual_score,vocabulary_score,grammar_score,pronunciation_score,fluency_score,result_json,provider,status)
  VALUES(job.user_id,lesson,job.exercise_id,job.practice_session_id,attempt_number,p_result->>'transcription',job.target_text,p_result->'intent'->>'status',
    (p_result->'intent'->>'score')::integer,(p_result->'vocabulary'->>'score')::integer,(p_result->'grammar'->>'score')::integer,NULL,NULL,p_result::text,p_provider,'completed') RETURNING id INTO attempt;
  UPDATE public.speech_processing_requests SET status='completed',attempt_id=attempt,usage_metadata=p_result->'usage',updated_at=now() WHERE request_id=p_request_id;
  RETURN attempt;
END $$;
REVOKE ALL ON FUNCTION public.claim_speech_request(uuid,bigint,bigint,bigint,text,text), public.complete_speech_request(uuid,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_speech_request(uuid,bigint,bigint,bigint,text,text), public.complete_speech_request(uuid,jsonb,text) TO service_role;

CREATE FUNCTION public.claim_speech_reference(p_key text, p_object text, p_user_id bigint)
RETURNS jsonb LANGUAGE plpgsql SET search_path = public AS $$
DECLARE cached public.speech_reference_cache; inserted integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended('reference:' || p_user_id, 0));
  SELECT * INTO cached FROM public.speech_reference_cache WHERE cache_key=p_key;
  IF FOUND THEN RETURN jsonb_build_object('claimed',false,'cache',to_jsonb(cached)); END IF;
  IF (SELECT count(*) FROM public.speech_reference_cache WHERE created_by=p_user_id AND created_at>now()-interval '1 minute') >= 10 THEN RAISE EXCEPTION 'SPEECH_RATE_LIMIT'; END IF;
  INSERT INTO public.speech_reference_cache(cache_key,created_by,status,object_key) VALUES(p_key,p_user_id,'processing',p_object) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS inserted = ROW_COUNT;
  SELECT * INTO cached FROM public.speech_reference_cache WHERE cache_key=p_key;
  RETURN jsonb_build_object('claimed',inserted=1,'cache',to_jsonb(cached));
END $$;
REVOKE ALL ON FUNCTION public.claim_speech_reference(text,text,bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_speech_reference(text,text,bigint) TO service_role;
