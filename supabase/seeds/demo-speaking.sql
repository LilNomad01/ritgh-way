-- Right Way Online — conteúdo de demonstração: módulo "Speaking na Prática".
-- Gerado automaticamente. Rode no SQL Editor do Supabase (projeto de produção ou de testes).
-- Cria 1 módulo, 3 seções, 5 aulas e 25 exercícios (20 com Speaking). Rodar de novo não duplica nada.
-- Para remover tudo depois, use supabase/seeds/demo-speaking-remove.sql.

do $seed$
declare
  v_module bigint;
  v_section bigint;
  v_lesson bigint;
begin
  if exists (select 1 from public.course_modules where title = 'Speaking na Prática') then
    raise notice 'O módulo Speaking na Prática já existe. Nada foi alterado.';
    return;
  end if;

  insert into public.course_modules (title, level, description, status, position)
  values ('Speaking na Prática', 'Speaking', 'Conversas reais do dia a dia para destravar a fala: apresentações, small talk, cafeteria, direções e hotel. Cada aula termina com exercícios de Speaking com feedback por IA.', 'Publicado',
          (select coalesce(max(position), 0) + 1 from public.course_modules))
  returning id into v_module;

  -- Seção 1: Primeiras conversas
  insert into public.course_sections (module_id, title, description, status, position)
  values (v_module, 'Primeiras conversas', 'Apresente-se e mantenha uma conversa curta com naturalidade.', 'Publicado', 1)
  returning id into v_section;

  -- Aula: Apresentando-se com confiança
  insert into public.lessons (section_id, title, description, duration, lesson_type, status, position, smart_rotation)
  values (v_section, 'Apresentando-se com confiança', 'Cumprimente, diga seu nome, de onde você é e o que faz.', '10 min', 'Vídeo + Speaking', 'Publicado', 1, 1)
  returning id into v_lesson;
  insert into public.lesson_exercises
    (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, rotation_variants_json, status, position)
  values
    (v_lesson, 'speaking', 'Primeiras conversas', 'Diga seu nome', 'Você acabou de chegar a uma reunião. Cumprimente as pessoas e apresente-se usando o nome Alex.', null, 'Hi, my name is Alex. Nice to meet you.', '["Hello, my name is Alex. Nice to meet you.", "Hi, I''m Alex. Nice to meet you.", "Hello, I''m Alex. Nice to meet you.", "Hi, I am Alex. Nice to meet you."]', 'Uma apresentação natural tem três partes: cumprimento (Hi), nome (my name is / I''m) e cortesia (Nice to meet you).', null, '["Speaking", "Vocabulário"]', '[{"title": "Primeiro dia de aula", "prompt": "No primeiro dia de aula, apresente-se para a turma usando o nome Sam.", "correct": "Hi, my name is Sam. Nice to meet you.", "accepted": ["Hi, I''m Sam. Nice to meet you.", "Hello, I''m Sam. Nice to meet you.", "Hello, my name is Sam. Nice to meet you."], "explanation": "", "options": []}]', 'Publicado', 1),
    (v_lesson, 'speaking', 'Primeiras conversas', 'De onde você é?', 'Alguém pergunta: Where are you from? Responda que você é do Brasil e mora no Rio.', null, 'I''m from Brazil. I live in Rio.', '["I am from Brazil. I live in Rio.", "I''m from Brazil and I live in Rio.", "I''m Brazilian. I live in Rio."]', 'Use be from para origem (I''m from Brazil) e live in para onde você mora agora (I live in Rio).', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 2),
    (v_lesson, 'choice_speaking', 'Primeiras conversas', 'Perguntando a profissão', 'Você quer saber a profissão de alguém. Escolha a pergunta mais natural e depois fale a opção escolhida.', '["What do you do for a living?", "What you do for work?", "Which is your job?"]', 'What do you do for a living?', '[]', 'What do you do for a living? é a forma mais natural de perguntar a profissão. Perguntas no presente simples precisam do auxiliar do.', null, '["Speaking", "Compreensão"]', '[]', 'Publicado', 3),
    (v_lesson, 'speaking', 'Primeiras conversas', 'Fale sobre seu trabalho', 'Diga que você trabalha como professor ou professora de inglês em uma escola.', null, 'I work as an English teacher at a school.', '["I''m an English teacher at a school.", "I am an English teacher at a school.", "I work as an English teacher in a school.", "I''m an English teacher in a school."]', 'Work as + profissão descreve sua função. Lembre do artigo: an English teacher (an antes de som de vogal).', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 4),
    (v_lesson, 'fill', 'Primeiras conversas', 'Verbo to be', 'Complete apenas a palavra que falta: She ___ my coworker. She works with me.', null, 'is', '[]', 'Com she, o verbo to be é is: She is my coworker.', null, '["Gramática"]', '[]', 'Publicado', 5);

  -- Aula: Small talk sem travar
  insert into public.lessons (section_id, title, description, duration, lesson_type, status, position, smart_rotation)
  values (v_section, 'Small talk sem travar', 'Responda como está, comente o fim de semana e encerre a conversa com educação.', '10 min', 'Vídeo + Speaking', 'Publicado', 2, 1)
  returning id into v_lesson;
  insert into public.lesson_exercises
    (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, rotation_variants_json, status, position)
  values
    (v_lesson, 'speaking', 'Primeiras conversas', 'Como você está?', 'Um colega pergunta: How are you doing? Responda que está bem e pergunte de volta.', null, 'I''m doing well, thanks. How about you?', '["I''m good, thanks. How about you?", "I''m fine, thank you. And you?", "I''m doing well, thank you. And you?", "I''m good, thanks. And you?", "I''m doing great, thanks. How about you?"]', 'Em small talk, responda de forma curta e devolva a pergunta: How about you? ou And you? mantém a conversa viva.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 1),
    (v_lesson, 'speaking', 'Primeiras conversas', 'Seu fim de semana', 'Conte que, no último fim de semana, você visitou sua família.', null, 'I visited my family last weekend.', '["Last weekend I visited my family.", "I visited my family on the weekend.", "Last weekend, I visited my family."]', 'Para ações terminadas no passado, use o passado simples: visit vira visited. Last weekend indica quando aconteceu.', null, '["Speaking", "Vocabulário"]', '[{"title": "Ontem à noite", "prompt": "Conte que, ontem à noite, você assistiu a um filme.", "correct": "I watched a movie last night.", "accepted": ["Last night I watched a movie.", "I watched a film last night."], "explanation": "Watch vira watched no passado simples. Last night significa ontem à noite.", "options": []}]', 'Publicado', 2),
    (v_lesson, 'choice_speaking', 'Primeiras conversas', 'Falando do tempo', 'Está um dia lindo e você quer puxar assunto. Escolha a frase correta e depois fale a opção escolhida.', '["It''s a beautiful day, isn''t it?", "It''s a beautiful day, no is?", "Is beautiful day today?"]', 'It''s a beautiful day, isn''t it?', '[]', 'A question tag isn''t it? convida a outra pessoa a concordar. É uma forma clássica de começar uma conversa.', null, '["Speaking", "Compreensão"]', '[]', 'Publicado', 3),
    (v_lesson, 'speaking', 'Primeiras conversas', 'Encerrando a conversa', 'Você precisa ir embora. Despeça-se dizendo que foi bom conversar.', null, 'It was nice talking to you. See you later!', '["It was great talking to you. See you later!", "Nice talking to you. See you later!", "It was nice talking to you. See you soon!", "It was nice talking with you. See you later!"]', 'It was nice talking to you encerra a conversa com simpatia. See you later! é uma despedida informal.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 4),
    (v_lesson, 'correction', 'Primeiras conversas', 'Passado simples', 'Corrija a frase: I go to the beach yesterday.', null, 'I went to the beach yesterday.', '[]', 'Yesterday pede o passado simples. Go é irregular: o passado é went.', null, '["Gramática"]', '[]', 'Publicado', 5);

  -- Seção 2: Situações do dia a dia
  insert into public.course_sections (module_id, title, description, status, position)
  values (v_module, 'Situações do dia a dia', 'Peça, pergunte e resolva situações comuns na rua e em estabelecimentos.', 'Publicado', 2)
  returning id into v_section;

  -- Aula: Pedindo no café
  insert into public.lessons (section_id, title, description, duration, lesson_type, status, position, smart_rotation)
  values (v_section, 'Pedindo no café', 'Faça o pedido, escolha para viagem e pague com cartão.', '10 min', 'Vídeo + Speaking', 'Publicado', 1, 1)
  returning id into v_lesson;
  insert into public.lesson_exercises
    (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, rotation_variants_json, status, position)
  values
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Fazendo o pedido', 'Você está no balcão de um café. Peça um cappuccino médio com educação.', null, 'Could I have a medium cappuccino, please?', '["Can I have a medium cappuccino, please?", "I''d like a medium cappuccino, please.", "Could I get a medium cappuccino, please?", "Can I get a medium cappuccino, please?"]', 'Could I have…, please? é um pedido educado. Evite traduzir eu quero como I want, que soa direto demais.', null, '["Speaking", "Vocabulário"]', '[{"title": "Chá gelado", "prompt": "Agora peça um chá gelado grande com educação.", "correct": "Could I have a large iced tea, please?", "accepted": ["Can I have a large iced tea, please?", "I''d like a large iced tea, please.", "Can I get a large iced tea, please?"], "explanation": "", "options": []}]', 'Publicado', 1),
    (v_lesson, 'choice_speaking', 'Situações do dia a dia', 'Para viagem ou para comer aqui?', 'O atendente pergunta: For here or to go? Você vai levar o pedido. Escolha a resposta e depois fale a opção escolhida.', '["To go, please.", "For go, please.", "To take, please."]', 'To go, please.', '[]', 'To go significa para viagem. For here significa para consumir no local.', null, '["Speaking", "Compreensão"]', '[]', 'Publicado', 2),
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Pedindo um detalhe', 'Pergunte se eles têm leite de aveia.', null, 'Do you have oat milk?', '["Do you have any oat milk?", "Do you guys have oat milk?"]', 'Do you have…? pergunta se algo está disponível. Oat milk é leite de aveia.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 3),
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Pagando a conta', 'Pergunte se você pode pagar com cartão.', null, 'Can I pay by card?', '["Can I pay with a card?", "Can I pay by credit card?", "Could I pay by card?", "Can I pay with card?", "Do you take cards?"]', 'Pay by card ou pay with a card são formas naturais. Do you take cards? também funciona.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 4),
    (v_lesson, 'situational', 'Situações do dia a dia', 'Agradecendo', 'O atendente entrega seu pedido. Agradeça e deseje um bom dia.', null, 'Thank you! Have a nice day.', '["Thanks! Have a nice day.", "Thank you! Have a good day.", "Thanks! Have a good day.", "Thank you so much! Have a nice day."]', 'Have a nice day ou Have a good day é a despedida padrão em atendimentos.', null, '["Escrita", "Vocabulário"]', '[]', 'Publicado', 5);

  -- Aula: Pedindo informações na rua
  insert into public.lessons (section_id, title, description, duration, lesson_type, status, position, smart_rotation)
  values (v_section, 'Pedindo informações na rua', 'Peça direções, confirme o caminho e peça para repetir.', '10 min', 'Vídeo + Speaking', 'Publicado', 2, 1)
  returning id into v_lesson;
  insert into public.lesson_exercises
    (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, rotation_variants_json, status, position)
  values
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Com licença', 'Aborde alguém na rua e pergunte onde fica a estação de metrô mais próxima.', null, 'Excuse me, where is the nearest subway station?', '["Excuse me, where''s the nearest subway station?", "Excuse me, how do I get to the nearest subway station?", "Excuse me, where is the nearest metro station?", "Excuse me, where''s the nearest metro station?"]', 'Comece com Excuse me para chamar a atenção com educação. The nearest significa o mais próximo.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 1),
    (v_lesson, 'choice_speaking', 'Situações do dia a dia', 'Confirmando o caminho', 'Você quer confirmar se deve virar à esquerda na esquina. Escolha a frase correta e depois fale a opção escolhida.', '["Should I turn left at the corner?", "Should I turn to the left on the corner?", "I must turn left in corner?"]', 'Should I turn left at the corner?', '[]', 'Turn left (sem to the) é a forma natural. Para esquina, use at the corner.', null, '["Speaking", "Compreensão"]', '[]', 'Publicado', 2),
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Pedindo para repetir', 'Você não entendeu a explicação. Peça para a pessoa repetir mais devagar.', null, 'Sorry, could you say that again more slowly?', '["Sorry, could you repeat that more slowly?", "Could you say that again more slowly, please?", "Sorry, can you repeat that more slowly?", "Could you repeat that more slowly, please?"]', 'Pedir para repetir é uma habilidade essencial. Could you say that again? soa natural e educado.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 3),
    (v_lesson, 'speaking', 'Situações do dia a dia', 'Quanto tempo leva?', 'Pergunte quanto tempo leva para chegar lá a pé.', null, 'How long does it take to walk there?', '["How long does it take to get there on foot?", "How long is the walk?", "How long does it take to walk?"]', 'How long does it take…? pergunta a duração de algo. To walk there indica que você vai a pé.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 4),
    (v_lesson, 'fill', 'Situações do dia a dia', 'Preposições de lugar', 'Complete apenas a palavra que falta: The bank is ___ to the pharmacy. (ao lado)', null, 'next', '[]', 'Next to significa ao lado de: The bank is next to the pharmacy.', null, '["Gramática", "Vocabulário"]', '[]', 'Publicado', 5);

  -- Seção 3: Viagem
  insert into public.course_sections (module_id, title, description, status, position)
  values (v_module, 'Viagem', 'Comunique-se com segurança no hotel.', 'Publicado', 3)
  returning id into v_section;

  -- Aula: Check-in no hotel
  insert into public.lessons (section_id, title, description, duration, lesson_type, status, position, smart_rotation)
  values (v_section, 'Check-in no hotel', 'Faça o check-in, tire dúvidas e resolva um problema no quarto.', '10 min', 'Vídeo + Speaking', 'Publicado', 1, 1)
  returning id into v_lesson;
  insert into public.lesson_exercises
    (lesson_id, exercise_type, category, title, prompt, options_json, correct_answer, accepted_answers_json, explanation, speech, skills_json, rotation_variants_json, status, position)
  values
    (v_lesson, 'speaking', 'Viagem', 'Tenho uma reserva', 'Na recepção, diga que você tem uma reserva no nome Silva.', null, 'Hi, I have a reservation under the name Silva.', '["Hello, I have a reservation under Silva.", "Hi, I have a booking under the name Silva.", "I have a reservation under the name Silva.", "Hi, I have a reservation under Silva."]', 'Under the name… indica em nome de quem está a reserva. Reservation e booking são equivalentes.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 1),
    (v_lesson, 'speaking', 'Viagem', 'Horário do café da manhã', 'Pergunte a que horas é servido o café da manhã.', null, 'What time is breakfast served?', '["What time is breakfast?", "When is breakfast served?", "What time do you serve breakfast?"]', 'What time…? pergunta o horário. Breakfast is served usa a voz passiva: o café é servido.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 2),
    (v_lesson, 'choice_speaking', 'Viagem', 'Resolvendo um problema', 'O ar-condicionado do quarto não está funcionando. Escolha como avisar a recepção e depois fale a opção escolhida.', '["The air conditioning in my room isn''t working.", "The air conditioning of my room no works.", "My room air conditioning don''t work."]', 'The air conditioning in my room isn''t working.', '[]', 'Isn''t working descreve um problema que está acontecendo agora. Em inglês, a negação precisa de um auxiliar.', null, '["Speaking", "Compreensão"]', '[]', 'Publicado', 3),
    (v_lesson, 'speaking', 'Viagem', 'Check-out mais tarde', 'Pergunte se é possível fazer o check-out mais tarde.', null, 'Would it be possible to check out later?', '["Is it possible to check out later?", "Could I check out later?", "Can I have a late checkout?", "Is late checkout possible?", "Could I have a late checkout?"]', 'Would it be possible to…? é uma forma muito educada de fazer um pedido.', null, '["Speaking", "Vocabulário"]', '[]', 'Publicado', 4),
    (v_lesson, 'fill', 'Viagem', 'Pedindo mais uma toalha', 'Complete apenas a palavra que falta: Could I have ___ towel, please? (mais uma)', null, 'another', '[]', 'Another significa mais um ou outro: Could I have another towel, please?', null, '["Vocabulário", "Gramática"]', '[]', 'Publicado', 5);

  raise notice 'Módulo criado (id %). Envie um vídeo para cada aula no painel admin para liberá-las.', v_module;
end
$seed$;
