# Atualização da experiência de aprendizagem

## Áudio real

Em Conteúdo, crie a atividade Escutar e transcrever como rascunho. Reabra Editar, envie uma gravação MP3/M4A/WAV/OGG/WebM de até 4 MB, confira a transcrição e publique. O upload salva imediatamente a gravação no R2. D1 armazena apenas o caminho e nome. Atividades antigas sem áudio precisam receber uma gravação; o aluno não recebe voz sintética como substituição.

## Correção e provas

Prévia, prática e revisão de prova comparam referência e resposta por palavras. Verde e vermelho com sublinhado distinguem acertos e divergências. Contrações não ambíguas, pontuação e caixa são normalizadas. Isso corrige escrita/transcrição, não pronúncia. Avaliação fonética por gravação não foi implementada.

Provas podem usar correção de frases, situações reais e perguntas da professora, além de escolha, lacunas e resposta curta. Exigem referência e explicação. A correção é determinística, não uma avaliação semântica livre; o professor deve cadastrar variantes aceitáveis e formular tarefas suficientemente específicas. Não é criado conteúdo pedagógico supostamente extraído de vídeos que não foram analisados nesta alteração.

## Dados e retomada

O início consulta a conta autenticada, sem as antigas notas, ranking, sequência, XP ou horas fictícias. Exibe aulas concluídas, tentativas, acertos e média de provas. Conquistas demonstrativas foram removidas. Retoma a prática ativa ou o vídeo recente que ainda está disponível na progressão acadêmica. Vídeos salvam posição durante reprodução, pausa, busca e saída; falhas de rede são mostradas. Respostas confirmadas de práticas mantêm a persistência existente; texto ainda não confirmado não é salvo.

## Vídeos

Cada aula suporta múltiplos vídeos e uma playlist. O administrador pode editar título/ordem, mover, reutilizar intervalos e remover vínculos. Intervalos são lógicos (início/fim), sem transcodificação: o MP4 original não é cortado fisicamente. Remover preserva o arquivo R2 e os demais vínculos. Alterar um intervalo reinicia o progresso daquele item. Todas as partes são necessárias para completar a etapa de vídeo. Conteúdo legado é incorporado com seu progresso ao primeiro gerenciamento/upload; migrações não apagam registros.

## Validação

Testes de normalização/comparação e testes SQLite com todas as migrações, incorporação idempotente do vídeo legado, isolamento por usuário e conclusão de múltiplos vídeos. Build de produção. Não houve ensaio em dispositivo Android nem avaliação de pronúncia. O backend permanece D1 + R2; esta atualização não migra para Supabase.
