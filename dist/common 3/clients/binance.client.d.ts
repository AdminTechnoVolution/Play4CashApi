export declare function getWithdrawalHistory(params?: Record<string, any>): Promise<any[]>;
export declare function getDepositHistory(params?: Record<string, any>): Promise<any[]>;
export declare function sendWithdrawalRequest(coin: string, network: string, address: string, amount: number): Promise<{
    id: string;
}>;
