import { Model } from 'mongoose';
import { User, UserDocument } from './schemas/user.schema';
export declare class UserRepository {
    private readonly userModel;
    constructor(userModel: Model<UserDocument>);
    findByEmail(email: string): Promise<UserDocument | null>;
    findById(id: string): Promise<UserDocument | null>;
    findByIdSelect(id: string, select: string): Promise<UserDocument | null>;
    findByUsername(username: string): Promise<UserDocument | null>;
    create(data: Partial<User>): Promise<UserDocument>;
    updateById(id: string, update: Partial<User>): Promise<UserDocument | null>;
    countRegisteredUsers(): Promise<number>;
    getTotalBalances(): Promise<any>;
}
