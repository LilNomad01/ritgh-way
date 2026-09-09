# Right Way — notas para nova lógica de exercícios

Este documento registra a direção pedagógica e técnica para a próxima etapa de programação dos exercícios da plataforma Right Way.

## Objetivo

Transformar a área de prática em uma experiência mais fiel à metodologia da professora: menos “joguinho estilo Duolingo”, mais treino compacto, contextual, visual, oral e com correção após a tentativa real do aluno.

## Implementação — setembro de 2026

- Listening novo e legado usam transcrição digitada, com repetição e velocidade reduzida.
- Áudio nesta versão: síntese de voz do aparelho, com aviso quando a reprodução falha. Upload de gravações e `audio_path` ainda não foram implementados.
- Correção, situações reais e perguntas da professora usam escrita; múltipla escolha continua disponível apenas no tipo de escolha contextual.
- Feedback após confirmação: correto, próximo (sem conceder acerto) ou incorreto, com alinhamento de palavras e explicação.
- Normalização compartilhada entre interface e servidor; a nota das práticas e do nivelamento é calculada no servidor.
- Salvamento aguardado antes de avançar; falhas permitem nova tentativa. Retomada da última questão não duplica a pontuação.
- Admin com campos condicionais, validação do texto do listening e 12 modelos editáveis entre básico, intermediário e avançado. Modelos não são publicados automaticamente.
- Nivelamento de oito perguntas mistura transcrição, correção, lacunas, situação e reformulação; permite “Não sei responder”. Resultado é uma estimativa inicial.
- Vocabulário por imagem, memória visual e upload de áudio permanecem como próximos recursos, sem alteração do esquema nesta etapa.
- Validação automatizada cobre comparação de respostas, contrações, negação e alinhamento de erros. Reprodução real em Android depende de validação no aparelho.

O aluno precisa pensar antes de receber feedback. Nada de mostrar qual alternativa está certa antes dele confirmar.

## Observação da metodologia das aulas gravadas

Os vídeos enviados não tinham faixa de áudio disponível para análise, então a leitura da metodologia foi feita visualmente.

Pontos observados:

- Aula ao vivo com professora conduzindo a atenção dos alunos.
- Uso frequente de quadro branco, objetos, imagens impressas e elementos visuais.
- Conteúdo ensinado por contexto: mostrar algo, pedir resposta, corrigir, repetir e avançar.
- A professora guia o aluno passo a passo, mas a resposta vem primeiro do aluno.
- A dinâmica parece mais próxima de “olhe, escute, responda, corrija e repita” do que de jogos de montar frase.

## Princípios para os exercícios

1. O exercício deve ser compacto.
2. O aluno precisa responder antes da correção aparecer.
3. A correção deve ensinar, não só dizer certo ou errado.
4. Evitar exercícios de ordenar palavras/frases.
5. Priorizar situações reais, objetos, escuta, escrita curta e correção de frases.
6. A “Maya” deve funcionar como uma professora guia, não como uma personagem decorativa.
7. O app deve parecer uma extensão da aula da professora.

## Nova lógica principal: listening por transcrição

Tipo de exercício desejado: o aluno escuta um áudio e precisa escrever exatamente o que ouviu.

Fluxo ideal:

1. A tela mostra uma instrução curta.
2. O aluno toca em “Ouvir áudio”.
3. O áudio toca uma frase em inglês.
4. O aluno digita o que ouviu.
5. O botão “Confirmar resposta” só libera quando existir texto digitado.
6. Depois de confirmar, o sistema mostra:
   - se acertou;
   - se quase acertou;
   - onde errou;
   - qual era a frase correta;
   - uma explicação curta.

Importante: esse exercício não deve mostrar alternativas. Se mostrar alternativas, vira chute e perde a força pedagógica.

## Estados da tela de listening

- `idle`: aluno ainda não ouviu.
- `playing`: áudio tocando.
- `typing`: aluno digitando.
- `confirmed_correct`: resposta confirmada e correta.
- `confirmed_almost`: resposta próxima, mas com erro.
- `confirmed_wrong`: resposta errada.

## Controles úteis

- Ouvir áudio.
- Ouvir novamente.
- Ouvir mais devagar.
- Confirmar resposta.
- Ver resposta correta somente depois da confirmação.

Opcional no futuro:

- Limitar número de repetições em provas.
- Permitir repetições livres em aulas normais.
- Adicionar gravação de voz para treino de pronúncia.

## Dados necessários para o listening

O banco não deve guardar o arquivo de áudio em si. O banco deve guardar apenas o caminho do arquivo.

Modelo recomendado:

```txt
lesson_exercises
  exercise_type = "listening_transcription"
  title
  prompt
  speech
  correct_answer
  accepted_answers_json
  explanation
  skills_json
  audio_path
```

O arquivo real deve ficar no Supabase Storage:

```txt
lesson-audio/basic/lesson-01/exercise-03.mp3
```

E no PostgreSQL:

```txt
audio_path = "lesson-audio/basic/lesson-01/exercise-03.mp3"
```

## Estratégia de áudio

Curto prazo:

- Usar `speech` com voz do navegador para validar a experiência.

Produção:

- Usar Supabase Storage para guardar arquivos `.mp3`, `.m4a` ou `.wav`.
- O banco guarda somente `audio_path`.
- O app carrega o áudio pelo caminho assinado ou público, conforme a regra de segurança.

## Validação da resposta

A comparação não deve ser burra demais, mas também não pode aceitar qualquer coisa.

Normalização básica:

- remover espaços extras;
- transformar tudo em minúsculo;
- ignorar pontuação final simples;
- comparar com `correct_answer`;
- comparar também com `accepted_answers_json`.

Exemplo:

```txt
Resposta correta:
Could I have a glass of water, please?

Aceitar também:
Could I have a glass of water please
Can I have a glass of water please
```

Melhoria futura:

- tratar contrações:
  - `I am` = `I'm`
  - `do not` = `don't`
  - `cannot` = `can't`
- detectar “quase certo” por similaridade de palavras;
- destacar palavras erradas;
- mostrar uma mensagem tipo: “Quase! Você entendeu a ideia, mas errou essa parte aqui.”

## Tipos de exercícios recomendados

### 1. Listening transcription

O aluno escuta e transcreve.

Exemplo:

```txt
Prompt:
Escute e escreva exatamente o que você ouviu.

Áudio:
Nice to meet you.

Resposta:
Nice to meet you.
```

### 2. Visual vocabulary

O aluno vê uma imagem ou objeto e responde o nome em inglês.

Exemplo:

```txt
Imagem:
calculator

Pergunta:
What is this?

Resposta:
calculator
```

### 3. Situational response

O aluno precisa escolher ou escrever a frase mais natural para uma situação real.

Exemplo:

```txt
Situação:
Você quer pedir um café de forma educada.

Resposta esperada:
Could I have a coffee, please?
```

### 4. Correction

O aluno corrige uma frase errada.

Exemplo:

```txt
Frase:
She don't like coffee.

Resposta:
She doesn't like coffee.
```

### 5. Fill gap with context

Completar uma frase curta dentro de um contexto.

Exemplo:

```txt
Frase:
I ____ from Brazil.

Resposta:
am
```

### 6. Teacher prompt

A Maya faz uma pergunta como se fosse a professora.

Exemplo:

```txt
Maya:
Answer in English: Como você pergunta o nome de alguém?

Resposta:
What is your name?
```

### 7. Memory recall

O aluno observa uma sequência curta de imagens ou palavras e depois responde.

Exemplo:

```txt
Mostrar:
pen, notebook, umbrella

Depois perguntar:
What was the second object?

Resposta:
notebook
```

## O que evitar

- Ordenar palavras para montar frase.
- Mostrar check verde antes de confirmar.
- Exercício muito longo em tela única.
- Questões que viram chute.
- Muitas alternativas óbvias.
- Transformar a metodologia em jogo infantilizado.

## Estrutura sugerida para uma aula

Cada aula pode ter entre 5 e 8 exercícios compactos:

1. Aquecimento visual.
2. Listening transcription curto.
3. Vocabulário com objeto/imagem.
4. Situação real.
5. Correção de frase.
6. Listening transcription um pouco mais difícil.
7. Resposta escrita curta.
8. Revisão final.

## Prova de nível

A prova inicial também deve seguir essa metodologia.

Ela pode misturar:

- listening transcription básico;
- escolha contextual;
- correção de frase;
- vocabulário visual;
- resposta curta.

Classificação sugerida:

- 0 a 2 acertos: nada/iniciante absoluto;
- 3 a 4 acertos: básico;
- 5 a 6 acertos: intermediário;
- 7 a 8 acertos: avançado.

## Impacto no painel admin

Quando o administrador criar um exercício de listening transcription:

- esconder o campo de opções;
- mostrar campo de texto do áudio;
- mostrar campo de resposta correta;
- mostrar campo de respostas aceitas;
- permitir upload de áudio no futuro;
- permitir preview como aluno.

Campos recomendados no admin:

- Tipo do exercício.
- Título.
- Instrução para o aluno.
- Texto do áudio.
- Arquivo de áudio.
- Resposta correta.
- Respostas aceitas.
- Explicação pós-resposta.
- Habilidades trabalhadas.
- Nível.
- Aula vinculada.

## Checklist para programação futura

- Criar ou ajustar tipo `listening_transcription`.
- Atualizar o player de exercícios para não renderizar opções nesse tipo.
- Adicionar botão de áudio + campo de transcrição.
- Bloquear feedback antes da confirmação.
- Melhorar função de validação de resposta.
- Adicionar estado de “quase certo”.
- Atualizar o painel admin com campos condicionais.
- Adicionar suporte a `audio_path`.
- Integrar Supabase Storage para áudio.
- Criar exercícios de exemplo por nível.
- Testar no mobile com teclado aberto.
- Testar áudio no PWA/app Android.

## Decisão de produto

A Right Way não deve copiar o Duolingo. A experiência deve parecer uma aula guiada, direta, inteligente e adulta.

O foco não é fazer o aluno “passar de fase”. O foco é fazer o aluno escutar, pensar, responder, corrigir e repetir até ganhar segurança.
