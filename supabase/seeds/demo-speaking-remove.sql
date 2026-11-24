-- Remove o módulo de demonstração "Speaking na Prática" e tudo que depende dele
-- (seções, aulas, exercícios, vídeos, sessões de prática e tentativas de Speaking).
-- Os arquivos de vídeo enviados continuam no Storage; apague-os pelo painel se quiser.
delete from public.course_modules where title = 'Speaking na Prática';
