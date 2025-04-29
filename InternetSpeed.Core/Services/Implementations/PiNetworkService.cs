using InternetSpeed.Core.PiNetwork;
using InternetSpeed.DataLayer.PiModels;
using InternetSpeed.Services.Interfaces;
using Microsoft.Extensions.Options;
using stellar_dotnet_sdk.responses;
using stellar_dotnet_sdk;

namespace InternetSpeed.Services.Implementations;

public class PiNetworkService:IPiNetworkService
{
    private readonly PiNetworkClient _piNetworkClient;

    public PiNetworkService(IOptions<PiNetworkSettings> options)
    {
        var settings = options.Value;
        _piNetworkClient = new PiNetworkClient(settings.ApiKey);
    }

    public Task<PaymentDataModel.PiAuthDto> AuthenticateAsync(string accessToken)
    {
        return _piNetworkClient.Me(accessToken);
    }

    public Task<PaymentDataModel.PaymentDto> GetPaymentAsync(string identifier)
    {
        return _piNetworkClient.Get(identifier);
    }

    public Task<List<PaymentDataModel.PaymentDto>> GetIncompletePaymentsAsync()
    {
        return _piNetworkClient.GetIncompleteServerPayments();
    }

    public Task<PaymentDataModel.PaymentDto> CreatePaymentAsync(PaymentDataModel.CreatePaymentDto dto)
    {
        return _piNetworkClient.Create(dto);
    }

    public Task<PaymentDataModel.PaymentDto> ApprovePaymentAsync(string identifier)
    {
        return _piNetworkClient.Approve(identifier);
    }

    public Task<PaymentDataModel.PaymentDto> CancelPaymentAsync(string identifier)
    {
        return _piNetworkClient.Cancel(identifier);
    }

    public Task<PaymentDataModel.PaymentDto> CompletePaymentAsync(string identifier, string tx)
    {
        return _piNetworkClient.Complete(identifier, tx);
    }

    public Task<double> GetAccountBalanceAsync(string network, string account)
    {
        return _piNetworkClient.GetAccountBalance(network, account);
    }

    public Task<SubmitTransactionResponse> SendAssetsAsync(string network, string seed, PaymentDataModel.TransactionData data, uint fee = 100000)
    {
        return _piNetworkClient.SendNativeAssets(network, seed, data, fee);
    }
}