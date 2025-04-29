using InternetSpeed.Services.Interfaces;
using Microsoft.AspNetCore.Mvc;
using System.Text;

namespace InternetSpeed.Web.Controllers
{
    [Route("payment")]
    [ApiController]
    public class PiPaymentController : Controller
    {
        private readonly IPiNetworkService _piService;

        public PiPaymentController(IPiNetworkService piService)
        {
            _piService = piService;
        }

        [HttpPost("approve")]
        public async Task<IActionResult> ApprovePayment([FromForm] string accessToken, [FromForm] string paymentId)
        {
            try
            {
                var result = await _piService.ApprovePaymentAsync(paymentId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("complete")]
        public async Task<IActionResult> CompletePayment([FromForm] string paymentId, [FromForm] string txid)
        {
            try
            {
                var result = await _piService.CompletePaymentAsync(paymentId, txid);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("cancel")]
        public async Task<IActionResult> CancelPayment([FromForm] string paymentId)
        {
            try
            {
                var result = await _piService.CancelPaymentAsync(paymentId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("error")]
        public async Task<IActionResult> ErrorPayment([FromForm] string paymentId)
        {
            try
            {
                var result = await _piService.CancelPaymentAsync(paymentId);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }

        [HttpPost("me")]
        public async Task<IActionResult> GetUserInfo([FromForm] string accessToken)
        {
            try
            {
                var result = await _piService.GetPaymentAsync(accessToken);
                return Ok(result);
            }
            catch (Exception ex)
            {
                return StatusCode(500, ex.Message);
            }
        }
    }
}

