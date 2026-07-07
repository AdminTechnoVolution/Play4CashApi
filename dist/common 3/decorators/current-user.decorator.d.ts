export interface JwtPayload {
    id: string;
    sub?: string;
    email: string;
    username?: string;
    name?: string;
    role?: 'admin' | 'user';
    familyId?: string;
    typ?: 'access';
    jti?: string;
    iat: number;
    exp: number;
}
export declare const CurrentUser: (...dataOrPipes: unknown[]) => ParameterDecorator;
