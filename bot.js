require("dotenv").config();
const { Telegraf, Markup } = require("telegraf");
const axios = require("axios");
const { createClient } = require("@supabase/supabase-js");

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_KEY);
const bot = new Telegraf(process.env.TELEGRAM_BOT_TOKEN);
const channelID = -1002177187950;

async function checkMembership(ctx, channelID) {
  try {
    const channelMember = await ctx.telegram.getChatMember(
      channelID,
      ctx.from.id
    );

    if (channelMember.status === "left") {
      const channelJoinLink =
        await ctx.telegram.exportChatInviteLink(channelID);
      return { member: false, joinLink: { channelJoinLink } };
    }

    return { member: true };
  } catch (error) {
    console.error("Error checking user membership:", error);
    return { member: false };
  }
}

bot.start(async ctx => {
  const query = ctx.message.text.split(" ")[1];

  const { member, joinLink } = await checkMembership(ctx, channelID);

  if (!member) {
    let message =
      "🚫 _Anda harus menjadi anggota channel untuk menggunakan perintah ini._";
    let replyMarkup = {
      inline_keyboard: []
    };

    if (joinLink.channelJoinLink) {
      message += "\n\n_Silakan bergabung ke channel:_";
      replyMarkup.inline_keyboard.push([
        { text: "Join Channel", url: joinLink.channelJoinLink },
        { text: "Try Again", url: `https://t.me/rategionbot?start=${query}` }
      ]);
    }

    // Reply with the message and button
    ctx.telegram.sendMessage(ctx.chat.id, message, {
      reply_markup: replyMarkup,
      parse_mode: "Markdown",
      disable_web_page_preview: true
    });
    return;
  }

  // User is a member, reply with waiting message
  const waitingMessage = await ctx.reply("⏱️ _Please waiting…_", {
    parse_mode: "Markdown"
  });

  if (query) {
    const { data, error } = await supabase
      .from("donations")
      .select("*")
      .eq("uid", query)
      .single();
  
    if (error) {
      console.error("Error fetching data from Supabase:", error.message);
      ctx.reply("🚫 _Terjadi kesalahan saat mencari data._", {
        parse_mode: "Markdown"
      });
    } else if (data) {
      try {
        let response;
        let mediaType = data.type;

        if (
          mediaType === "photo" ||
          mediaType === "video" ||
          mediaType === "audio"
        ) {
          response = await axios.get(data.url, {
            responseType: "arraybuffer"
          });
        } else {
          throw new Error("Unsupported media type");
        }

        if (mediaType === "photo") {
          await ctx.replyWithPhoto(
            { source: Buffer.from(response.data) },
            { caption: data.caption }
          );
        } else if (mediaType === "video") {
          await ctx.replyWithVideo(
            { source: Buffer.from(response.data) },
            { caption: data.caption }
          );
        } else if (mediaType === "audio") {
          await ctx.replyWithAudio(
            { source: Buffer.from(response.data) },
            { caption: data.caption }
          );
        }
        await ctx.telegram.deleteMessage(
          ctx.chat.id,
          waitingMessage.message_id
        );
      } catch (error) {
        console.error("Error fetching or sending media:", error);
        ctx.reply("🚫 _Gagal mengirim media. Silakan coba lagi nanti._", {
          parse_mode: "Markdown"
        });
      }
    } else {
      ctx.reply(
        "🚫 _Tidak ada data yang ditemukan. Silakan coba lagi nanti._",
        {
          parse_mode: "Markdown"
        }
      );
    }
  } else {
    ctx.reply("🚫 _Tidak ada data yang ditemukan. Silakan coba lagi nanti._", {
      parse_mode: "Markdown"
    });
  }
});

bot.launch().then(() => {
  console.log("Bot is running");
});
