using InternetSpeed.Core.PiNetwork;
using InternetSpeed.Services.Implementations;
using InternetSpeed.Services.Interfaces;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.
builder.Services.AddControllersWithViews();

builder.Services.Configure<PiNetworkSettings>(builder.Configuration.GetSection("PiNetwork"));

builder.Services.AddScoped<IPiNetworkService, PiNetworkService>();


var app = builder.Build();



// Configure the HTTP request pipeline.
if (!app.Environment.IsDevelopment())
{
    app.UseExceptionHandler("/Home/Error");
    app.UseHsts();
}


app.UseHttpsRedirection();
app.UseStaticFiles();
app.UseRouting();
app.UseAuthorization();
app.UseStatusCodePagesWithReExecute("/Error/{0}");
app.MapControllerRoute(
    name: "default",
    pattern: "{controller=Home}/{action=Index}/{id?}");

app.Run();
