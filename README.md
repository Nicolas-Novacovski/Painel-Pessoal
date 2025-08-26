
# 🚀 Painel Pessoal - Um Dashboard Inteligente para Casais

![React](https://img.shields.io/badge/React-19-blue?style=for-the-badge&logo=react)
![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=for-the-badge&logo=typescript)
![Supabase](https://img.shields.io/badge/Supabase-Backend-green?style=for-the-badge&logo=supabase)
![Gemini API](https://img.shields.io/badge/Google%20Gemini-AI-purple?style=for-the-badge&logo=google-gemini)
![Vercel](https://img.shields.io/badge/Deployed%20on-Vercel-black?style=for-the-badge&logo=vercel)

<br/>

<p align="center">
  <img src="https://user-images.githubusercontent.com/12476938/212200231-7e0b2e81-2e65-4f3a-8664-9a7071f00844.png" alt="Capa do Painel Pessoal" width="800"/>
</p>

O **Painel Pessoal** é uma aplicação web completa e inteligente, desenhada para ser o centro de organização da vida de um casal. Desde o planejamento de jantares e viagens até o controle financeiro e o bem-estar, este painel integra ferramentas práticas com o poder da **IA do Google Gemini** para criar uma experiência fluida, automatizada e personalizada.

---

## ✨ Funcionalidades Principais

O painel é dividido em módulos, cada um com um conjunto rico de funcionalidades:

### 🍽️ Gastronomia e Lazer
- **Gerenciador de Restaurantes**: Uma lista compartilhada de restaurantes, com avaliações, fotos, faixa de preço, localizações e mais.
- **✨ Preenchimento com IA**: Adicione um novo restaurante apenas com o nome. A IA busca na internet e preenche automaticamente a categoria, tipo de cozinha, endereço, nota do Google e mais.
- **🗺️ Mapa de Conquistas**: Visualize todos os restaurantes visitados em um mapa interativo.
- **🎲 Roleta do Date**: Não conseguem decidir onde ir? Deixe a roleta escolher aleatoriamente um restaurante da sua lista de "Favoritos" ou "Quero Ir".
- **❤️ Modo Descoberta**: Uma interface estilo Tinder para decidir em conjunto quais restaurantes da lista vocês querem visitar.
- **✨ Recomendador com IA**: Uma página dedicada onde você descreve o que está com vontade de comer (e o que quer evitar), e a IA sugere o restaurante perfeito em Curitiba.
- **📚 Livro de Receitas Digital**: Um espaço para salvar receitas de comidas e drinks.
- **✨ Importação de Receitas com IA**: Cole um link ou apenas digite o nome de uma receita, e a IA importa os ingredientes, modo de preparo e até a foto.
- **🎤 Adicionar Receita com a Voz**: Dite uma receita completa e a IA transcreve e a estrutura para você.
- **📷 Extrair Ingredientes de Foto**: Tire uma foto da lista de ingredientes e a IA a converte em texto estruturado.
- **🧑‍🍳 Modo Cozinhar**: Uma interface de passo a passo otimizada para a cozinha, que mantém a tela do dispositivo sempre acesa.
- **🔬 Análise Nutricional com IA**: Calcule as informações nutricionais de qualquer receita com um clique.

### 💰 Planejamento Financeiro
- **Controle de Despesas Mensal**: Lance despesas, categorize por fonte de pagamento (Conta Pessoal, Cartão) e marque como pagas.
- **✨ Entrada Rápida com IA**: Adicione uma despesa digitando uma frase simples como `"Jantar no shopping 120 reais no cartão ontem"`. A IA analisa e cadastra a transação corretamente.
- **Pagamentos Recorrentes**: Gerencie despesas fixas (aluguel, assinaturas) e sincronize-as com o Google Calendar.
- **Metas e Objetivos**: Crie metas financeiras (ex: "Viagem ao Japão"), defina um valor e acompanhe o progresso com depósitos e retiradas.
- **Fechamento Mensal**: Consolide as rendas e despesas do mês para ter uma visão clara do seu saldo.

### ✈️ Planejador de Viagens
- **Gerenciamento de Viagens**: Organize múltiplas viagens, com datas, destinos, orçamento e capa personalizada.
- **Roteiro Detalhado**: Crie um itinerário dia a dia, adicionando voos, hospedagens, atividades e restaurantes.
- **✨ Sugestões de Roteiro com IA**: Peça para a IA sugerir atividades e pontos turísticos com base no seu destino e interesses.
- **Controle de Orçamento**: Registre todas as despesas da viagem, categorizadas para fácil visualização.
- **Checklist Inteligente**: Use um checklist padrão e personalizável para não esquecer de nada.
- **Galeria de Fotos**: Guarde as melhores memórias da viagem em uma galeria dedicada.

### 🎯 Produtividade e Bem-Estar
- **Lembretes (Post-its)**: Um quadro virtual de post-its coloridos para lembretes e tarefas, que podem ser atribuídos a um ou ambos os parceiros.
- **Checklist de Hábitos**: Crie e acompanhe hábitos diários em conjunto.
- **Registro de Humor**: Monitore diariamente como cada um está se sentindo.
- **✨ Sugestão para o Casal**: Com base no humor registrado, a IA sugere uma atividade personalizada para melhorar o dia e a conexão do casal.
- **Listas Diversas**: Crie listas de desejos, links úteis ou lugares que precisam visitar.

### 🔐 Administração
- **Painel de Admin**: Interface exclusiva para o administrador gerenciar usuários.
- **Controle de Acesso Granular**: Defina exatamente quais módulos cada usuário pode visualizar.
- **Gerenciador de Listas Curadas**: Crie e edite listas de restaurantes temáticas (ex: "Melhores Cafés") que os usuários podem importar.

---

## 🛠️ Stack de Tecnologias

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend & Banco de Dados**: Supabase (PostgreSQL, Autenticação, Storage em tempo real)
- **Inteligência Artificial**: Google Gemini API (para NLP, busca semântica, geração de JSON e análise de imagem)
- **Mapas**: Leaflet.js
- **Gráficos**: Chart.js
- **Deployment**: Vercel

---

## 🚀 Como Executar Localmente

Siga os passos abaixo para configurar e rodar o projeto em sua máquina.

### Pré-requisitos
- [Node.js](https://nodejs.org/) (versão 18 ou superior)
- Uma conta no [Supabase](https://supabase.com/)
- Uma chave de API do [Google Gemini](https://ai.google.dev/)
- Credenciais do Google Cloud para o Login com Google

### Passos de Instalação

1.  **Clone o repositório:**
    ```bash
    git clone https://github.com/seu-usuario/painel-pessoal.git
    cd painel-pessoal
    ```

2.  **Instale as dependências:**
    ```bash
    npm install
    ```

3.  **Configure o Supabase:**
    - Crie um novo projeto no Supabase.
    - Vá para o **SQL Editor** no painel do seu projeto.
    - O aplicativo possui guias de auto-correção. Ao encontrar um erro de banco de dados pela primeira vez (ex: tabela `user_profiles` não encontrada), a própria interface irá exibir o código SQL exato que você precisa executar. Copie e cole esse código no SQL Editor e execute.
    - Crie os **Buckets de Armazenamento** públicos no Supabase Storage: `restaurant-images`, `memory-images`, `recipe-images`, `job-application-images`, `trip-images`. As políticas de acesso também serão fornecidas pela interface do aplicativo se houver um erro de permissão.

4.  **Configure as Variáveis de Ambiente:**
    - Crie um arquivo `.env` na raiz do projeto, copiando o conteúdo de `.env.example` (se houver) ou criando um novo.
    - Adicione suas chaves do Supabase e do Gemini:
      ```env
      VITE_SUPABASE_URL="https://SEU_PROJETO.supabase.co"
      VITE_SUPABASE_ANON_KEY="SUA_CHAVE_ANON"
      VITE_GEMINI_API_KEY="SUA_CHAVE_GEMINI"
      ```

5.  **Configure o Login com Google:**
    - Crie um projeto no [Google Cloud Console](https://console.cloud.google.com/).
    - Configure uma tela de consentimento OAuth e crie uma credencial de "ID do cliente OAuth".
    - Adicione a URL do seu ambiente de desenvolvimento (ex: `http://localhost:5173`) às "Origens JavaScript autorizadas".
    - Copie o **Client ID** e cole-o na constante `GOOGLE_CLIENT_ID` dentro do arquivo `App.tsx`.

6.  **Rode a aplicação:**
    ```bash
    npm run dev
    ```
    O aplicativo estará disponível em `http://localhost:5173`.

---

## 🏛️ Arquitetura e Conceitos Chave

- **Componentização com React**: A interface é construída de forma modular, com componentes reutilizáveis para UI (`UIComponents.tsx`) e funcionalidades específicas de cada módulo.
- **Atualizações em Tempo Real**: O uso dos canais de assinatura do Supabase garante que todas as alterações feitas por um usuário (ex: adicionar um restaurante) sejam refletidas instantaneamente na tela do outro usuário, sem a necessidade de recarregar a página.
- **Resolução de Erros de DB na UI**: Uma das funcionalidades mais interessantes é a capacidade do aplicativo de detectar erros de esquema do banco de dados (tabelas ou colunas ausentes) e apresentar ao administrador o código SQL exato para corrigir o problema, tornando a manutenção e as atualizações muito mais simples.
- **Integração Profunda com IA**: O Gemini não é apenas um "chatbot". Ele é usado como um verdadeiro co-piloto para automatizar tarefas:
    - **Extração de Entidades**: Lendo texto em linguagem natural e convertendo-o em dados estruturados (JSON).
    - **Busca Semântica (Grounding)**: Utilizando o Google Search para encontrar informações atualizadas e confiáveis na web.
    - **Análise de Imagem**: Extraindo texto de imagens de listas de ingredientes.
    - **Geração de Conteúdo**: Criando sugestões de atividades e modos de preparo de receitas.

---

## 📄 Licença

Este projeto é licenciado sob a Licença MIT. Veja o arquivo `LICENSE` para mais detalhes.
