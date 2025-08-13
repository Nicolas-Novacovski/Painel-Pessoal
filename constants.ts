import { User, RestaurantCategory, RecipeCategory, PaymentSource, ReminderColor, View } from './types';

export const USERS: User[] = ['Nicolas', 'Ana Beatriz Diva Linda', 'Visitante', 'Umara', 'Renato'];
export const RESTAURANT_CATEGORIES: RestaurantCategory[] = ['Café', 'Jantar', 'Lanche', 'Bar', 'Outro'];
export const RECIPE_CATEGORIES: RecipeCategory[] = ['Salgado', 'Doce'];
export const PAYMENT_SOURCES: PaymentSource[] = ['Conta Pessoal', 'Cartão'];
export const REMINDER_COLORS: ReminderColor[] = ['yellow', 'pink', 'blue', 'green'];

/**
 * O e-mail do único usuário com permissões de administrador.
 */
export const ADMIN_EMAIL = 'nicolas.vendrami@gmail.com';
export const ADMIN_COUPLE_EMAILS = ['nicolas.vendrami@gmail.com', 'anabeatrizsilvaqz@gmail.com'];


// --- New constants for location filtering ---
export const HOME_ADDRESSES = {
  nicolas: {
    name: 'Casa Nicolas',
    label: 'Perto de Casa (NV)',
    address: 'Rua João Alencar Guimarães, 2580',
    coords: { latitude: -25.4615, longitude: -49.3243 }
  },
  ana: {
    name: 'Casa Ana Beatriz',
    label: 'Perto de Casa (AB)',
    address: 'Rua João Bettega, 1951',
    coords: { latitude: -25.4745, longitude: -49.3033 }
  }
};

export const PROXIMITY_THRESHOLD_KM = 5; // 5km radius

export const ALL_VIEWS: { id: View; name: string; description: string }[] = [
    { id: 'dashboard', name: 'Painel', description: 'Visão geral com widgets.' },
    { id: 'restaurants', name: 'Restaurantes', description: 'Gerenciar e explorar restaurantes.' },
    { id: 'ai-recommender', name: 'Recomendador IA', description: 'Receber recomendações de restaurantes com IA.' },
    { id: 'lists', name: 'Listas', description: 'Listas de desejos, links e tarefas.' },
    { id: 'expenses', name: 'Planejamento', description: 'Controle financeiro mensal.' },
    { id: 'recipes', name: 'Receitas', description: 'Livro de receitas do casal.' },
    { id: 'reminders', name: 'Lembretes', description: 'Post-its virtuais e calendário.' },
    { id: 'wellness', name: 'Bem-Estar', description: 'Acompanhamento de hábitos e humor.' },
    { id: 'applications', name: 'Aplicações', description: 'Acompanhar aplicações de emprego.' },
    { id: 'admin', name: 'Admin', description: 'Gerenciar usuários e permissões.' },
];