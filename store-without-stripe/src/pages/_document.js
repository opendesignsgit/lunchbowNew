import Document, { Html, Head, Main, NextScript } from "next/document";
import SettingServices from "@services/SettingServices";

class MyDocument extends Document {
  static async getInitialProps(ctx) {
    const initialProps = await Document.getInitialProps(ctx);

    // Fetch general metadata from backend API
    const setting = await SettingServices.getStoreSeoSetting();

    return { ...initialProps, setting };
  }

  render() {
    const setting = this.props.setting;

    return (
      <Html lang="en">
        <Head>
          {/* ✅ Google Tag Manager (head part) */}
          <script
            dangerouslySetInnerHTML={{
              __html: `
                (function(w,d,s,l,i){
                  w[l]=w[l]||[];
                  w[l].push({'gtm.start': new Date().getTime(), event:'gtm.js'});
                  var f=d.getElementsByTagName(s)[0],
                  j=d.createElement(s),
                  dl=l!='dataLayer'?'&l='+l:'';
                  j.async=true;
                  j.src='https://www.googletagmanager.com/gtm.js?id='+i+dl;
                  f.parentNode.insertBefore(j,f);
                })(window,document,'script','dataLayer','GTM-T4FFNTX6');
              `,
            }}
          />

          {/* ✅ Favicon and SEO tags */}
          <link rel="icon" href={setting?.favicon || "/favicon.png"} />
          <meta
            property="og:title"
            content={
              setting?.meta_title ||
              "lunchBowl - Healthy Bites to Fuel Your Child’s Mind"
            }
          />
          <meta property="og:type" content="eCommerce Website" />
          <meta
            property="og:description"
            content={
              setting?.meta_description ||
              "Healthy Bites to Fuel Your Child’s Mind"
            }
          />
          <meta
            name="keywords"
            content={setting?.meta_keywords || "ecommerce online store"}
          />

          {/* Optional OG tags */}
          {/* <meta property="og:url" content={setting?.meta_url || "https://lunchBowl-store.vercel.app/"} /> */}
          {/* <meta property="og:image" content={setting?.meta_img || "https://res.cloudinary.com/..."} /> */}

          {/* ✅ External Styles */}
          <link
            rel="stylesheet"
            type="text/css"
            charSet="UTF-8"
            href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick.min.css"
          />
          <link
            rel="stylesheet"
            type="text/css"
            href="https://cdnjs.cloudflare.com/ajax/libs/slick-carousel/1.8.1/slick-theme.min.css"
          />
        </Head>
        <body>
          {/* ✅ Google Tag Manager (noscript part) */}
          <noscript
            dangerouslySetInnerHTML={{
              __html: `
                <iframe src="https://www.googletagmanager.com/ns.html?id=GTM-T4FFNTX6"
                height="0" width="0" style="display:none;visibility:hidden"></iframe>
              `,
            }}
          />
          <Main />
          <NextScript />
        </body>
      </Html>
    );
  }
}

export default MyDocument;
