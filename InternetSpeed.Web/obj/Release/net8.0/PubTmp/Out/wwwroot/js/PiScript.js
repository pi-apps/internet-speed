
const Pi = window.Pi;

const scopes = ['payments'];
let accessToken;

function onIncompletePaymentFound(payment) {
    console.log("payment incomplete found: ", payment);
    paymentId = payment.identifier;
    txid = payment.transaction.txid;
    $.post('/payment/complete',
        {
            paymentId: paymentId,
            txid: txid,
            debug: 'cancel'
        }
    );
};

Pi.authenticate(scopes, onIncompletePaymentFound).then(function (auth) {
    console.log('woot!');
    accessToken = auth.accessToken;
}).catch(function (error) {
    console.error(error);
});
// main payments function
function createPayment() {
    var amountTxt = $("#donationAmount").val();
    console.log("Star donation payment with :", amountTxt, " unit Pi");
    const paymentData = {
        amount: amountTxt,
        memo: "this buy is for Donation . . .",
        metadata: { insultid: 123456 }
    };
    // the SDK does all this like magic
    const paymentCallbacks = {
        onReadyForServerApproval: (paymentDTO) => {
            paymentId = paymentDTO;
            $.post('/payment/approve',
                {
                    paymentId: paymentId,
                    accessToken: accessToken
                });
        },
        onReadyForServerCompletion: (paymentDTO, txid) => {
            paymentId = paymentDTO;
            txid = txid;
            $.post('/payment/complete',
                {
                    paymentId: paymentId,
                    txid: txid,
                    debug: 'complete'
                }
            ), function(result) {
                console.log("anjam shod :" , result);
            }
        },
        onCancel: (paymentDTO) => {
            paymentId = paymentDTO.identifier;
            $.post('/payment/complete',
                {
                    paymentId: paymentId,
                    debug: 'cancel'
                }
            );
        },
        onError: (paymentDTO) => {
            console.log('There was an error ', paymentDTO);
            paymentId = paymentDTO.identifier;
            $.post('/payment/error',
                {
                    paymentDTO: paymentDTO,
                    paymentId: paymentId,
                    debug: 'error'
                }
            );
        },
        onIncompletePaymentFound: function (paymentDTO) {
            paymentId = paymentDTO.identifier;
            console.log('onIncompletePaymentFound', paymentId);
            $.post('/payment/complete',
                {
                    paymentId: paymentId,
                    txid: paymentDTO.transaction.txid
                }
            );
        }
    };
    Pi.createPayment(paymentData, paymentCallbacks);
}