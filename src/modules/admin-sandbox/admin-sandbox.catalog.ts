export type SandboxParameterLocation = 'path' | 'query';
export type SandboxParameterType = 'string' | 'number' | 'boolean' | 'date';
export type SandboxAuth = 'public' | 'authenticated' | 'admin';

export interface SandboxParameterSpec {
  name: string;
  location: SandboxParameterLocation;
  type: SandboxParameterType;
  required: boolean;
  description: string;
  allowed_values?: string[];
}

export interface SandboxEndpointSpec {
  id: string;
  module: string;
  method: 'GET';
  path: string;
  description: string;
  authentication: SandboxAuth;
  parameters: SandboxParameterSpec[];
  response_example: unknown;
}

const pathId = (name: string, description: string): SandboxParameterSpec => ({
  name,
  location: 'path',
  type: 'string',
  required: true,
  description,
});

const query = (
  name: string,
  type: SandboxParameterType,
  description: string,
  allowed_values?: string[],
): SandboxParameterSpec => ({
  name,
  location: 'query',
  type,
  required: false,
  description,
  ...(allowed_values ? { allowed_values } : {}),
});

const envelopeExample = { success: true, messages: [], data: {} };
const listExample = { success: true, messages: [], data: [] };

export const ADMIN_SANDBOX_ENDPOINTS: readonly SandboxEndpointSpec[] = [
  { id: 'admin-health', module: 'Infraestructura', method: 'GET', path: '/api/admin/health', description: 'Diagnóstico real de API, MongoDB, Redis y Socket.IO.', authentication: 'admin', parameters: [], response_example: envelopeExample },
  { id: 'admin-deposits', module: 'Dashboard', method: 'GET', path: '/api/admin/dashboard/deposits', description: 'Tráfico confirmado de depósitos USDT agregado en UTC.', authentication: 'admin', parameters: [query('period', 'string', 'Periodo analítico.', ['7d', '30d', '90d'])], response_example: envelopeExample },
  { id: 'admin-app-version-stats', module: 'Infraestructura', method: 'GET', path: '/api/admin/app-versions/stats', description: 'Distribución de versiones de clientes observadas.', authentication: 'admin', parameters: [query('days', 'number', 'Cantidad de días entre 1 y 60.')], response_example: envelopeExample },

  { id: 'admin-games-list', module: 'Juegos', method: 'GET', path: '/api/admin/games', description: 'Catálogo completo de juegos para administración.', authentication: 'admin', parameters: [], response_example: listExample },
  { id: 'admin-games-detail', module: 'Juegos', method: 'GET', path: '/api/admin/games/{id}', description: 'Detalle administrativo de un juego.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB del juego.')], response_example: envelopeExample },
  { id: 'games-list', module: 'Juegos', method: 'GET', path: '/api/games', description: 'Catálogo localizado de juegos activos.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'games-detail', module: 'Juegos', method: 'GET', path: '/api/games/{id}', description: 'Detalle localizado de un juego activo.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB del juego.')], response_example: envelopeExample },

  { id: 'admin-tournaments-list', module: 'Torneos', method: 'GET', path: '/api/admin/tournaments', description: 'Todos los torneos con campos administrativos.', authentication: 'admin', parameters: [], response_example: listExample },
  { id: 'admin-tournaments-detail', module: 'Torneos', method: 'GET', path: '/api/admin/tournaments/{id}', description: 'Detalle administrativo de un torneo.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB del torneo.')], response_example: envelopeExample },
  { id: 'tournaments-list', module: 'Torneos', method: 'GET', path: '/api/tournaments', description: 'Torneos visibles para el usuario autenticado.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'tournaments-history', module: 'Torneos', method: 'GET', path: '/api/tournaments/history', description: 'Historial de torneos del usuario autenticado.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'tournaments-mine', module: 'Torneos', method: 'GET', path: '/api/tournaments/mine', description: 'Torneos próximos o activos del usuario.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'tournaments-detail', module: 'Torneos', method: 'GET', path: '/api/tournaments/{id}', description: 'Detalle público de un torneo.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB del torneo.')], response_example: envelopeExample },
  { id: 'tournaments-state', module: 'Torneos', method: 'GET', path: '/api/tournaments/{id}/state', description: 'Estado compacto y hora oficial del torneo.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB del torneo.')], response_example: envelopeExample },
  { id: 'tournaments-bracket', module: 'Torneos', method: 'GET', path: '/api/tournaments/{id}/bracket', description: 'Bracket y resultados del torneo.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB del torneo.')], response_example: envelopeExample },

  { id: 'rooms-stats', module: 'Salas', method: 'GET', path: '/api/rooms/stats', description: 'Estadísticas públicas de salas y jugadores conectados.', authentication: 'public', parameters: [], response_example: envelopeExample },
  { id: 'rooms-active', module: 'Salas', method: 'GET', path: '/api/rooms/active', description: 'Sala activa del usuario autenticado.', authentication: 'authenticated', parameters: [], response_example: envelopeExample },
  { id: 'rooms-by-game', module: 'Salas', method: 'GET', path: '/api/rooms/game/{game_id}', description: 'Salas esperando o iniciadas para un juego.', authentication: 'authenticated', parameters: [pathId('game_id', 'ID MongoDB del juego.')], response_example: listExample },
  { id: 'rooms-status', module: 'Salas', method: 'GET', path: '/api/rooms/{id}/status', description: 'Estado ligero de una sala.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB de la sala.')], response_example: envelopeExample },
  { id: 'rooms-state', module: 'Salas', method: 'GET', path: '/api/rooms/{id}/state', description: 'Estado autoritativo de la sala para el usuario.', authentication: 'authenticated', parameters: [pathId('id', 'ID MongoDB de la sala.')], response_example: envelopeExample },

  { id: 'admin-contact-list', module: 'Contacto', method: 'GET', path: '/api/admin/contact-us', description: 'Solicitudes de contacto, opcionalmente filtradas por estado.', authentication: 'admin', parameters: [query('status', 'string', 'Estado del ticket.', ['new', 'read', 'resolved'])], response_example: listExample },
  { id: 'admin-contact-detail', module: 'Contacto', method: 'GET', path: '/api/admin/contact-us/{id}', description: 'Detalle completo de una solicitud de contacto.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la solicitud.')], response_example: envelopeExample },
  { id: 'contact-mine', module: 'Contacto', method: 'GET', path: '/api/contact-us/mine', description: 'Solicitudes enviadas por el usuario autenticado.', authentication: 'authenticated', parameters: [], response_example: listExample },

  { id: 'audit-run', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/runs/{id}', description: 'Estado y progreso de una ejecución de auditoría.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la ejecución.')], response_example: envelopeExample },
  { id: 'audit-results', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/runs/{id}/results', description: 'Resultados paginados de una auditoría.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la ejecución.'), query('status', 'string', 'Estado del hallazgo.', ['candidate', 'inconclusive', 'partially_refunded', 'refunded', 'discarded']), query('page', 'number', 'Página, desde 1.'), query('limit', 'number', 'Resultados por página.')], response_example: envelopeExample },
  { id: 'audit-room-detail', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/rooms/{roomId}', description: 'Evidencia completa de auditoría para una sala.', authentication: 'admin', parameters: [pathId('roomId', 'ID MongoDB de la sala.')], response_example: envelopeExample },

  { id: 'treasury-summary', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/summary', description: 'Resumen contable y conciliación de la casa.', authentication: 'admin', parameters: [query('refresh_binance', 'boolean', 'Solicitar una lectura actualizada del saldo Binance.', ['true', 'false'])], response_example: envelopeExample },
  { id: 'treasury-ledger', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/ledger', description: 'Libro contable paginado de la casa.', authentication: 'admin', parameters: [query('type', 'string', 'Tipo de movimiento contable.'), query('game_code', 'string', 'Código del juego.'), query('room_id', 'string', 'ID de sala.'), query('tournament_id', 'string', 'ID de torneo.'), query('administrator_id', 'string', 'ID del administrador.'), query('from', 'date', 'Fecha ISO inicial.'), query('to', 'date', 'Fecha ISO final.'), query('page', 'number', 'Página, desde 1.'), query('limit', 'number', 'Resultados por página, máximo 200.')], response_example: envelopeExample },
  { id: 'treasury-ledger-detail', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/ledger/{id}', description: 'Detalle inmutable de un movimiento contable.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB del movimiento.')], response_example: envelopeExample },

  { id: 'user-platform-totals', module: 'Usuarios', method: 'GET', path: '/api/user/admin/total-balances', description: 'Totales agregados de usuarios y balances.', authentication: 'admin', parameters: [], response_example: envelopeExample },
  { id: 'user-public-stats', module: 'Usuarios', method: 'GET', path: '/api/user/public/stats', description: 'Cantidad pública de usuarios registrados.', authentication: 'public', parameters: [], response_example: envelopeExample },
  { id: 'user-account', module: 'Usuarios', method: 'GET', path: '/api/user/account', description: 'Perfil de la cuenta administrativa autenticada.', authentication: 'authenticated', parameters: [], response_example: envelopeExample },
  { id: 'user-history', module: 'Usuarios', method: 'GET', path: '/api/user/history', description: 'Historial de partidas de la cuenta autenticada.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'recharge-history', module: 'Transacciones', method: 'GET', path: '/api/transactions/recharge/history', description: 'Historial de depósitos de la cuenta autenticada.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'withdrawal-history', module: 'Transacciones', method: 'GET', path: '/api/transactions/withdrawal/history', description: 'Historial de retiros de la cuenta autenticada.', authentication: 'authenticated', parameters: [], response_example: listExample },

  { id: 'config-read', module: 'Configuración', method: 'GET', path: '/api/config', description: 'Configuración global de solo lectura.', authentication: 'authenticated', parameters: [], response_example: envelopeExample },
  { id: 'wallets-list', module: 'Configuración', method: 'GET', path: '/api/wallets', description: 'Wallets activas de la plataforma.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'greetings-random', module: 'Contenido', method: 'GET', path: '/api/greetings', description: 'Muestra localizada de saludos activos.', authentication: 'authenticated', parameters: [], response_example: listExample },
  { id: 'greetings-all', module: 'Contenido', method: 'GET', path: '/api/greetings/all', description: 'Todos los saludos para administración.', authentication: 'admin', parameters: [], response_example: listExample },
] as const;

export const ADMIN_SANDBOX_CATALOG = {
  read_only: true as const,
  generated_at: null,
  endpoints: ADMIN_SANDBOX_ENDPOINTS,
};
