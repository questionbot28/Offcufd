const { MessageEmbed } = require('discord.js');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Check if Gemini API key is available
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

module.exports = {
  name: 'chat',
  description: 'Chat with the AI assistant',
  usage: 'chat <your message>',
  async execute(message, args) {
    // Check if the message has content
    if (!args.length) {
      const noArgsEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription('Please provide a message to chat with the AI.\nExample: `.chat Hello, how are you today?`');
      return message.channel.send({ embeds: [noArgsEmbed] });
    }

    try {
      // Check if API key is available
      if (!GEMINI_API_KEY) {
        const noKeyEmbed = new MessageEmbed()
          .setColor('#FF0000')
          .setTitle('Configuration Error')
          .setDescription('Gemini API key is not configured. Please add it to your .env file as GEMINI_API_KEY.');
        return message.channel.send({ embeds: [noKeyEmbed] });
      }

      // Let the user know we're processing their request
      const processingEmbed = new MessageEmbed()
        .setColor('#FFA500')
        .setDescription('🤔 Thinking...');
      const processingMessage = await message.channel.send({ embeds: [processingEmbed] });

      // Initialize the Gemini API with the provided key
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      
      // Configure the model
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

      // Get the full message from args
      const userMessage = args.join(' ');

      // Create a chat session
      const chat = model.startChat({
        history: [
          {
            role: "user",
            parts: [{ text: "You are a friendly assistant in a Discord server. Keep your responses concise, helpful and conversational. Respond in a natural, human-like way. Avoid being overly formal or robotic." }],
          },
          {
            role: "model",
            parts: [{ text: "Got it! I'll be a friendly, conversational assistant that keeps things natural and to the point. I'll avoid sounding too robotic or formal, and I'll focus on being helpful while keeping my responses concise. How can I help you today?" }],
          },
        ],
        generationConfig: {
          maxOutputTokens: 500,
          temperature: 0.7,
          topP: 0.8,
          topK: 40,
        },
      });

      // Generate the response
      const result = await chat.sendMessage(userMessage);
      const response = result.response.text();

      // Edit the processing message with the AI's response
      const responseEmbed = new MessageEmbed()
        .setColor('#00FF00')
        .setTitle(`Reply to ${message.author.username}`)
        .setDescription(response)
        .setFooter({ text: 'Made by itsmeboi' });

      await processingMessage.edit({ embeds: [responseEmbed] });
      
    } catch (error) {
      console.error('Error in chat command:', error);
      
      // Handle API errors gracefully
      const errorEmbed = new MessageEmbed()
        .setColor('#FF0000')
        .setTitle('Error')
        .setDescription(`There was an error processing your request: ${error.message}`);
      
      message.channel.send({ embeds: [errorEmbed] });
    }
  }
};