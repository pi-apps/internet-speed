using InternetSpeed.DataLayer.PiModels;
using stellar_dotnet_sdk.responses;

namespace InternetSpeed.Services.Interfaces;

public interface IPiNetworkService
{
    Task<PaymentDataModel.PiAuthDto> AuthenticateAsync(string accessToken);
    Task<PaymentDataModel.PaymentDto> GetPaymentAsync(string identifier);
    Task<List<PaymentDataModel.PaymentDto>> GetIncompletePaymentsAsync();
    Task<PaymentDataModel.PaymentDto> CreatePaymentAsync(PaymentDataModel.CreatePaymentDto dto);
    Task<PaymentDataModel.PaymentDto> ApprovePaymentAsync(string identifier);
    Task<PaymentDataModel.PaymentDto> CancelPaymentAsync(string identifier);
    Task<PaymentDataModel.PaymentDto> CompletePaymentAsync(string identifier, string tx);
    Task<double> GetAccountBalanceAsync(string network, string account);
    Task<SubmitTransactionResponse> SendAssetsAsync(string network, string seed, PaymentDataModel.TransactionData data, uint fee = 100000);
}