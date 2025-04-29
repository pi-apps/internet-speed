using InternetSpeed.Services.Interfaces;
using InternetSpeed.Web.Models;
using Microsoft.AspNetCore.Mvc;
using System.Diagnostics;

namespace InternetSpeed.Web.Controllers
{
    public class HomeController : Controller
    {
        private readonly ILogger<HomeController> _logger;
        public HomeController(ILogger<HomeController> logger)
        {
            _logger = logger;
        }

        [Route("/")]
        public IActionResult Index()
        {
            return View();
        }

        [Route("Privacy")]
        public IActionResult Privacy()
        {
            return View();
        }

        [Route("TermsOfService")]
        public IActionResult TermsOfService()
        {
            return View();
        }

        [Route("/SpeedTest")]
        public IActionResult SpeedTest()
        {
            return View();
        }

        [Route("/ContactUs")]
        public IActionResult ContactUs()
        {
            return View();
        }

        [Route("/Maintenance")]
        public IActionResult Maintenance()
        {
            return View();
        }


        [Route("/Error/{statusCode}")]
        [ResponseCache(Duration = 0, Location = ResponseCacheLocation.None, NoStore = true)]
        public async Task<IActionResult> Error(int statusCode)
        {
            switch (statusCode)
            {
                case 404:
                    return View("Errors/Error404");

                default:
                    return View("Errors/Error", new ErrorViewModel { RequestId = Activity.Current?.Id ?? HttpContext.TraceIdentifier });

            }
        }
    }
}
