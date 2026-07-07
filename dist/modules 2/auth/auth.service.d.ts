import { ConfigService } from '@nestjs/config';
import { UserRepository } from '../user/user.repository';
export declare class AuthService {
    private readonly config;
    private readonly userRepo;
    private readonly redis;
    private readonly logger;
    private readonly googleClient;
    constructor(config: ConfigService, userRepo: UserRepository, redis: any);
    loginUser(googleToken: string): Promise<any>;
    refreshToken(currentRefreshToken: string): Promise<any>;
    logoutUser(accessToken: string, refreshToken?: string): Promise<void>;
    private resolveRole;
    private issueAccessToken;
    private issueRefreshToken;
    private signToken;
    private persistFamily;
    private revokeFamily;
}
