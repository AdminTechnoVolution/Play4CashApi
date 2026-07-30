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
  { id: 'admin-tournaments-list', module: 'Torneos', method: 'GET', path: '/api/admin/tournaments', description: 'Todos los torneos con campos administrativos.', authentication: 'admin', parameters: [], response_example: listExample },
  { id: 'admin-tournaments-detail', module: 'Torneos', method: 'GET', path: '/api/admin/tournaments/{id}', description: 'Detalle administrativo de un torneo.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB del torneo.')], response_example: envelopeExample },

  { id: 'admin-contact-list', module: 'Contacto', method: 'GET', path: '/api/admin/contact-us', description: 'Solicitudes de contacto, opcionalmente filtradas por estado.', authentication: 'admin', parameters: [query('status', 'string', 'Estado del ticket.', ['new', 'read', 'resolved'])], response_example: listExample },
  { id: 'admin-contact-detail', module: 'Contacto', method: 'GET', path: '/api/admin/contact-us/{id}', description: 'Detalle completo de una solicitud de contacto.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la solicitud.')], response_example: envelopeExample },

  { id: 'audit-run', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/runs/{id}', description: 'Estado y progreso de una ejecución de auditoría.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la ejecución.')], response_example: envelopeExample },
  { id: 'audit-results', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/runs/{id}/results', description: 'Resultados paginados de una auditoría.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB de la ejecución.'), query('status', 'string', 'Estado del hallazgo.', ['candidate', 'inconclusive', 'partially_refunded', 'refunded', 'discarded']), query('page', 'number', 'Página, desde 1.'), query('limit', 'number', 'Resultados por página.')], response_example: envelopeExample },
  { id: 'audit-room-detail', module: 'Auditoría', method: 'GET', path: '/api/admin/game-audits/rooms/{roomId}', description: 'Evidencia completa de auditoría para una sala.', authentication: 'admin', parameters: [pathId('roomId', 'ID MongoDB de la sala.')], response_example: envelopeExample },

  { id: 'treasury-summary', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/summary', description: 'Resumen contable y conciliación de la casa.', authentication: 'admin', parameters: [query('refresh_binance', 'boolean', 'Solicitar una lectura actualizada del saldo Binance.', ['true', 'false'])], response_example: envelopeExample },
  { id: 'treasury-ledger', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/ledger', description: 'Libro contable paginado de la casa.', authentication: 'admin', parameters: [query('type', 'string', 'Tipo de movimiento contable.'), query('game_code', 'string', 'Código del juego.'), query('room_id', 'string', 'ID de sala.'), query('tournament_id', 'string', 'ID de torneo.'), query('administrator_id', 'string', 'ID del administrador.'), query('from', 'date', 'Fecha ISO inicial.'), query('to', 'date', 'Fecha ISO final.'), query('page', 'number', 'Página, desde 1.'), query('limit', 'number', 'Resultados por página, máximo 200.')], response_example: envelopeExample },
  { id: 'treasury-ledger-detail', module: 'Tesorería', method: 'GET', path: '/api/admin/house-treasury/ledger/{id}', description: 'Detalle inmutable de un movimiento contable.', authentication: 'admin', parameters: [pathId('id', 'ID MongoDB del movimiento.')], response_example: envelopeExample },

  { id: 'admin-platform-totals', module: 'Usuarios', method: 'GET', path: '/api/admin/metrics/platform-totals', description: 'Totales agregados de usuarios y balances.', authentication: 'admin', parameters: [], response_example: envelopeExample },
  { id: 'admin-config', module: 'Configuración', method: 'GET', path: '/api/admin/config', description: 'Configuración global para administración.', authentication: 'admin', parameters: [], response_example: envelopeExample },
  { id: 'admin-wallets', module: 'Configuración', method: 'GET', path: '/api/admin/wallets', description: 'Wallets de la plataforma para administración.', authentication: 'admin', parameters: [], response_example: listExample },
  { id: 'admin-greetings', module: 'Contenido', method: 'GET', path: '/api/admin/greetings', description: 'Todos los saludos para administración.', authentication: 'admin', parameters: [], response_example: listExample },
] as const;

export const ADMIN_SANDBOX_CATALOG = {
  read_only: true as const,
  generated_at: null,
  endpoints: ADMIN_SANDBOX_ENDPOINTS,
};
