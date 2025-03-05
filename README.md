# PixProofValidator

**Validador de Comprovantes PIX com OCR e IA**

O **PixProofValidator** é um sistema avançado para validação de comprovantes de pagamento PIX, utilizando tecnologias como OCR (Reconhecimento Óptico de Caracteres) e IA (Inteligência Artificial) para garantir a autenticidade dos documentos. O projeto foi desenvolvido para analisar comprovantes de pagamento, extrair informações relevantes (como valor, beneficiário, datas e metadados) e verificar sua validade com base em regras pré-definidas e análise de IA.

---

## Funcionalidades

- **Upload de Comprovantes**: Aceita imagens JPG de comprovantes de pagamento.
- **OCR com Tesseract.js**: Extrai texto de imagens para análise.
- **Processamento de Imagens**: Utiliza **Sharp** para redimensionar, normalizar e melhorar a qualidade das imagens.
- **Extração de Metadados**: Analisa metadados da imagem (resolução, data de criação, software utilizado, etc.) para detectar possíveis inconsistências.
- **Validação com IA**: Integração com **Google Generative AI (Gemini)** para análise de autenticidade e detecção de fraudes.
- **Interface Web**: Interface simples e intuitiva para upload de comprovantes e visualização de resultados.
- **Análise Detalhada**:
  - Verificação de palavras-chave, valores monetários e datas.
  - Detecção de capturas de tela e edições na imagem.
  - Comparação com dados esperados (valor, beneficiário, banco, etc.).

---

## Tecnologias Utilizadas

- **Backend**:
  - Node.js
  - Express
  - Multer (upload de arquivos)
  - Tesseract.js (OCR)
  - Sharp (processamento de imagens)
  - ExifReader (metadados)
  - Google Generative AI (Gemini)

- **Frontend**:
  - HTML, CSS e JavaScript
  - Drag-and-drop para upload de arquivos
  - Exibição detalhada de resultados

---

## Como Funciona

1. O usuário faz o upload de uma imagem JPG de um comprovante PIX.
2. O sistema processa a imagem, extrai o texto e os metadados.
3. A IA analisa os dados e verifica a autenticidade do comprovante.
4. O usuário recebe um relatório detalhado, incluindo:
   - Validade do comprovante.
   - Metadados da imagem.
   - Análise de texto (palavras-chave, valores, datas).
   - Conclusão da IA sobre a autenticidade.
   - Avisos de possíveis inconsistências.

---

## Instalação e Uso

1. Clone o repositório:
   ```bash
   git clone https://github.com/seu-usuario/PixProofValidator.git
   cd PixProofValidator