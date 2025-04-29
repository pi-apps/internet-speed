using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace InternetSpeed.DataLayer.DTOs
{
    public class DonationDto
    {
        [Display(Name = "َAmount")]
        [Required]
        [Range(1,10000000)]
        public int AmountDonation { get; set; }

        [Display(Name = "Message")]
        [Required]
        public string Message { get; set; }
    }
}
